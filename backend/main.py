from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from extractor import ExtractionError, extract, report_id

ROOT = Path(__file__).resolve().parent.parent
DATA_JSON = Path(os.environ.get("EFEKTI_PODACI") or ROOT / "data-json")
DATA_PDF = ROOT / "data-pdf"
DIST = ROOT / "frontend" / "dist"
DATA_JSON.mkdir(exist_ok=True)

ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")

app = FastAPI(title="Efekti lijekova")
app.add_middleware(GZipMiddleware, minimum_size=2000)


def _path(rid: str) -> Path:
    if not ID_RE.match(rid):
        raise HTTPException(400, "Neispravan ID izvještaja.")
    return DATA_JSON / f"{rid}.json"


def _load(p: Path) -> dict:
    with open(p, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("id") != p.stem:
        d["id"] = p.stem
        _save(p, d)
    return d


def _save(p: Path, d: dict) -> None:
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))


_cache: dict[str, tuple[float, dict]] = {}


def _summaries() -> list[dict]:
    out, alive = [], set()
    for p in DATA_JSON.glob("*.json"):
        alive.add(p.name)
        mtime = p.stat().st_mtime
        hit = _cache.get(p.name)
        if not hit or hit[0] != mtime:
            d = _load(p)
            hit = (p.stat().st_mtime, {"id": d["id"], "meta": d["meta"], "kolone": d["kolone"],
                                       "ukupno": d["ukupno"], "kontrola": d["kontrola"]})
            _cache[p.name] = hit
        out.append(hit[1])
    for k in set(_cache) - alive:
        del _cache[k]
    out.sort(key=lambda r: (r["meta"].get("ustanova_sifra") or "", r["meta"]["period_do"]))
    return out


def _import_pdf(pdf_path: str, name: str) -> dict:
    try:
        data = extract(pdf_path, name)
    except ExtractionError as e:
        return {"fajl": name, "ok": False, "greska": str(e)}
    except Exception as e:
        return {"fajl": name, "ok": False, "greska": f"PDF se ne može pročitati: {e}"}
    rid = report_id(data)
    target = DATA_JSON / f"{rid}.json"
    replaced = target.exists()
    data["id"] = rid
    _save(target, data)
    summary = next(r for r in _summaries() if r["id"] == rid)
    return {"fajl": name, "ok": True, "zamijenjen": replaced, "izvjestaj": summary}


@app.get("/api/reports")
def list_reports():
    return _summaries()


@app.get("/api/reports/{rid}")
def get_report(rid: str):
    p = _path(rid)
    if not p.exists():
        raise HTTPException(404, "Izvještaj ne postoji.")
    return FileResponse(p, media_type="application/json")


@app.delete("/api/reports/{rid}")
def delete_report(rid: str):
    p = _path(rid)
    if not p.exists():
        raise HTTPException(404, "Izvještaj ne postoji.")
    p.unlink()
    return {"ok": True}


@app.get("/api/dataset")
def dataset(ustanova: str | None = None):
    picked = [r for r in _summaries()
              if ustanova is None or (r["meta"].get("ustanova_sifra") or "nepoznato") == ustanova]
    picked.sort(key=lambda r: r["meta"]["period_do"])

    def stream():
        yield b"["
        for i, r in enumerate(picked):
            if i:
                yield b","
            yield (DATA_JSON / f"{r['id']}.json").read_bytes()
        yield b"]"

    return StreamingResponse(stream(), media_type="application/json")


@app.post("/api/import")
async def import_files(files: list[UploadFile] = File(...)):
    results = []
    for uf in files:
        name = os.path.basename(uf.filename or "izvjestaj.pdf")
        if not name.lower().endswith(".pdf"):
            results.append({"fajl": name, "ok": False, "greska": "Fajl nije PDF."})
            continue
        fd, tmp = tempfile.mkstemp(suffix=".pdf")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(await uf.read())
            results.append(_import_pdf(tmp, name))
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass
    return results


@app.post("/api/import-folder")
def import_folder():
    if not DATA_PDF.exists():
        return []
    return [_import_pdf(str(p), p.name) for p in sorted(DATA_PDF.glob("*.pdf"))]


AUTO_SHUTDOWN = os.environ.get("EFEKTI_AUTO_GASENJE") == "1"
GRACE_S = 6
STALE_S = 300
_clients: dict[str, float] = {}
_clients_lock = threading.Lock()
_had_client = False


async def _client_id(request: Request) -> str | None:
    cid = (await request.body()).decode("utf-8", "ignore").strip()
    return cid if ID_RE.match(cid) and len(cid) <= 64 else None


@app.post("/api/heartbeat")
async def heartbeat(request: Request):
    global _had_client
    cid = await _client_id(request)
    if cid:
        with _clients_lock:
            _clients[cid] = time.monotonic()
            _had_client = True
    return {"ok": True, "auto_gasenje": AUTO_SHUTDOWN}


@app.post("/api/bye")
async def bye(request: Request):
    cid = await _client_id(request)
    if cid:
        with _clients_lock:
            _clients.pop(cid, None)
    return {"ok": True}


def _watch_clients():
    empty_since = None
    last = time.monotonic()
    while True:
        time.sleep(1)
        now = time.monotonic()
        with _clients_lock:
            if now - last > 15:  # racunar je bio uspavan: daj karticama vremena da se jave
                for k in _clients:
                    _clients[k] = now
            last = now
            for k, seen in list(_clients.items()):
                if now - seen > STALE_S:
                    del _clients[k]
            idle = _had_client and not _clients
        if not idle:
            empty_since = None
        elif empty_since is None:
            empty_since = now
        elif now - empty_since >= GRACE_S:
            print("Aplikacija je zatvorena u browseru - gasim server.", flush=True)
            os._exit(0)


if AUTO_SHUTDOWN:
    threading.Thread(target=_watch_clients, daemon=True).start()


class PdfBody(BaseModel):
    html: str


def _browser() -> str | None:
    for var in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if not base:
            continue
        for rel in ("Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"):
            p = Path(base) / rel
            if p.exists():
                return str(p)
    for name in ("msedge", "chrome", "google-chrome", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    return None


@app.post("/api/export/pdf")
def export_pdf(body: PdfBody):
    exe = _browser()
    if not exe:
        raise HTTPException(501, "Za snimanje PDF-a potreban je Microsoft Edge ili Google Chrome. Koristite dugme Štampaj.")
    tmp = Path(tempfile.mkdtemp(prefix="efekti-pdf-"))
    try:
        src, out = tmp / "izvjestaj.html", tmp / "izvjestaj.pdf"
        src.write_text(body.html, encoding="utf-8")
        try:
            subprocess.run(
                [exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                 f"--user-data-dir={tmp / 'profil'}", f"--print-to-pdf={out}", src.as_uri()],
                timeout=120, capture_output=True)
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "Pravljenje PDF-a je trajalo predugo.")
        # Edge zavrsi stampu u pozadinskom procesu, pa se ceka da fajl prestane da raste.
        size, deadline = -1, time.monotonic() + 90
        while time.monotonic() < deadline:
            now = out.stat().st_size if out.exists() else -1
            if now > 0 and now == size:
                break
            size = now
            time.sleep(0.4)
        else:
            raise HTTPException(500, "PDF nije napravljen. Koristite dugme Štampaj.")
        data = out.read_bytes()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=izvjestaj.pdf"})


class ExportBody(BaseModel):
    naziv: str = "izvoz"
    kolone: list[str]
    redovi: list[list]


@app.post("/api/export/xlsx")
def export_xlsx(body: ExportBody):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = re.sub(r"[\[\]\*\?/\\:]", " ", body.naziv)[:31] or "izvoz"
    ws.append(body.kolone)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in body.redovi:
        ws.append(r)
    for i, title in enumerate(body.kolone, start=1):
        width = max([len(str(title))] + [len(str(r[i - 1])) for r in body.redovi[:300] if i - 1 < len(r)])
        ws.column_dimensions[get_column_letter(i)].width = min(max(10, width + 2), 60)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, float):
                c.number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=izvoz.xlsx"})


if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        f = DIST / full_path
        if full_path and f.is_file() and DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
