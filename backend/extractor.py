from __future__ import annotations

import re
from datetime import datetime, date

try:
    import pymupdf as fitz
except ImportError:
    import fitz

COLUMN_CODES = {
    "1(2+3)": "ukupno",
    "2": "fzo",
    "3(3a+3b+3c+3d)": "zus",
    "3a": "efekti",
    "3b": "ino",
    "3c": "ksz_ped",
    "3d": "ksz_gin",
    "4": "neprijavljeni",
}
DEFAULT_COLUMNS = list(COLUMN_CODES.values())

AMOUNT_RE = re.compile(r"^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$")
ID_RE = re.compile(r"^\d{6,14}$")
DATE_RE = r"(\d{1,2})\.(\d{1,2})\.(\d{4})"


class ExtractionError(Exception):
    pass


def _cents(text: str) -> int:
    neg = text.startswith("-")
    digits = text.lstrip("-").replace(".", "").replace(",", "")
    return -int(digits) if neg else int(digits)


def _lines(page) -> list[list[tuple]]:
    words = [w for w in page.get_text("words") if w[4].strip()]
    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    lines: list[list[tuple]] = []
    cur: list[tuple] = []
    cur_y = None
    for w in words:
        y = (w[1] + w[3]) / 2
        if cur_y is None or abs(y - cur_y) > 3.0:
            if cur:
                lines.append(sorted(cur, key=lambda t: t[0]))
            cur, cur_y = [w], y
        else:
            cur.append(w)
    if cur:
        lines.append(sorted(cur, key=lambda t: t[0]))
    return lines


# FZO RS PDF za ligature "ti" i "fi" upisuje samo "t" odnosno "f", pa se slovo "i"
# gubi vec u samom PDF-u. Ovdje se vracaju samo opsta pravila koja vaze za bilo
# koju ustanovu; ostalo korisnik ispravlja u aplikaciji (Import -> Nazivi).
_NAME_FIXES = [
    (r"\b([Tt])m\b", r"\1im"),
    (r"stč", "stič"), (r"stk", "stik"), (r"fk", "fik"),
    (r"\bSvet (?=\w)", "Sveti "),
    (r'(\w)" (\w[^"]*")', r'\1 "\2'),
]


def _fix_name(s: str | None) -> str | None:
    if s:
        for a, b in _NAME_FIXES:
            s = re.sub(a, b, s)
    return s


def _text(words) -> str:
    return " ".join(w[4] for w in words)


def _segment_after(words, label_idx: int, max_gap: float = 45.0) -> str:
    out = []
    prev_x1 = words[label_idx][2]
    for w in words[label_idx + 1:]:
        if w[0] - prev_x1 > max_gap:
            break
        out.append(w[4])
        prev_x1 = w[2]
    return " ".join(out)


def _iso(d: str, m: str, y: str) -> str:
    return date(int(y), int(m), int(d)).isoformat()


def _parse_header(lines) -> dict:
    meta = {
        "kancelarija": None, "ustanova_sifra": None, "ustanova_naziv": None,
        "period_od": None, "period_do": None, "stampano": None,
        "ljekar": None, "lijek": None, "naslov": None,
    }
    for words in lines:
        txt = _text(words)
        for i, w in enumerate(words):
            t = w[4]
            if t == "Kancelarija:":
                meta["kancelarija"] = _segment_after(words, i)
            elif t == "Ljekar:":
                meta["ljekar"] = _segment_after(words, i)
            elif t == "Lijek:":
                meta["lijek"] = _segment_after(words, i)
            elif t == "ustanova:" and i > 0 and words[i - 1][4] == "Zdravstvena":
                seg = _segment_after(words, i)
                m = re.match(r"^(\d+)\s+(.*)$", seg)
                if m:
                    meta["ustanova_sifra"], meta["ustanova_naziv"] = m.group(1), m.group(2)
                else:
                    meta["ustanova_naziv"] = seg
        m = re.search(r"Period:\s*od\s*" + DATE_RE + r"\s*do\s*" + DATE_RE, txt)
        if m:
            meta["period_od"] = _iso(*m.group(1, 2, 3))
            meta["period_do"] = _iso(*m.group(4, 5, 6))
        m = re.search(DATE_RE + r"\.?\s+(\d{1,2}):(\d{2}):(\d{2})", txt)
        if m and "tampanja" in txt:
            d, mo, y, h, mi, s = (int(x) for x in m.groups())
            meta["stampano"] = datetime(y, mo, d, h, mi, s).isoformat()
        if txt.startswith("Pregled "):
            meta["naslov"] = txt
    meta["ustanova_naziv"] = _fix_name(meta["ustanova_naziv"])
    return meta


def _code_line_columns(words) -> list[str] | None:
    toks = [w[4] for w in words]
    if len(toks) >= 4 and all(t in COLUMN_CODES for t in toks):
        return [COLUMN_CODES[t] for t in toks]
    return None


def extract(pdf_path: str, source_name: str | None = None, progress=None) -> dict:
    doc = fitz.open(pdf_path)
    n_pages = doc.page_count
    if n_pages == 0:
        raise ExtractionError("PDF nema strana.")

    meta = None
    columns: list[str] | None = None
    teams: list[dict] = []
    total: list[int] | None = None
    warnings: list[str] = []
    current: dict | None = None

    for pno in range(n_pages):
        lines = _lines(doc[pno])
        if pno == 0:
            meta = _parse_header(lines)
            if not meta["period_od"] or not meta["period_do"]:
                raise ExtractionError(
                    "U zaglavlju nije pronadjen period (\"Period: od ... do ...\"). "
                    "Ovo ne izgleda kao FZO RS izvjestaj o propisanim lijekovima.")

        start = 0
        for i, words in enumerate(lines):
            cols = _code_line_columns(words)
            if cols:
                if columns is None:
                    columns = cols
                elif cols != columns:
                    warnings.append(f"Strana {pno + 1}: drugaciji raspored kolona nego na prvoj strani.")
                start = i + 1
                break
        else:
            warnings.append(f"Strana {pno + 1}: nije pronadjen red sa siframa kolona.")
        if columns is None:
            columns = DEFAULT_COLUMNS
        ncol = len(columns)

        for words in lines[start:]:
            toks = [w[4] for w in words]
            amounts = [t for t in toks if AMOUNT_RE.match(t)]
            first = toks[0]

            if first == "Tim:":
                label = " ".join(t for t in toks[1:] if not AMOUNT_RE.match(t)).strip()
                m = re.match(r"^(\d+)\s*-\s*(.*)$", label)
                current = {
                    "sifra": m.group(1) if m else None,
                    "naziv": _fix_name((m.group(2) if m else label).strip()),
                    "zbir": None,
                    "pacijenti": [],
                    "_strana": pno + 1,
                }
                teams.append(current)
                if len(amounts) == ncol:
                    current["zbir"] = [_cents(a) for a in amounts]
                continue

            if first.upper().startswith("UKUPNO"):
                if len(amounts) == ncol:
                    total = [_cents(a) for a in amounts]
                else:
                    warnings.append(f"Strana {pno + 1}: red UKUPNO ima {len(amounts)} iznosa umjesto {ncol}.")
                continue

            if len(amounts) != ncol:
                if amounts or ID_RE.match(first):
                    warnings.append(f"Strana {pno + 1}: preskocen nejasan red: \"{_text(words)[:80]}\"")
                continue

            values = [_cents(a) for a in amounts]
            non_amount = [t for t in toks if not AMOUNT_RE.match(t)]
            if current is None:
                warnings.append(f"Strana {pno + 1}: red sa iznosima prije prvog tima.")
                continue
            if not non_amount:
                if current["zbir"] is None and not current["pacijenti"]:
                    current["zbir"] = values
                else:
                    warnings.append(f"Strana {pno + 1}: red sa iznosima bez JMBG-a u timu {current['naziv']}.")
                continue
            current["pacijenti"].append(["".join(non_amount), *values])

        if progress:
            progress(pno + 1, n_pages)

    doc.close()
    checks = _validate(columns, teams, total)
    n_pat = sum(len(t["pacijenti"]) for t in teams)
    if n_pat == 0:
        raise ExtractionError("U PDF-u nije pronadjen nijedan red sa pacijentom.")

    f = lambda arr: None if arr is None else [round(c / 100, 2) for c in arr]
    return {
        "verzija": 1,
        "meta": {
            **meta,
            "izvorni_fajl": source_name,
            "broj_strana": n_pages,
            "ekstraktovano": datetime.now().isoformat(timespec="seconds"),
            "broj_timova": len(teams),
            "broj_redova": n_pat,
            "broj_pacijenata": len({p[0] for t in teams for p in t["pacijenti"]}),
        },
        "kolone": columns,
        "ukupno": f(total),
        "timovi": [
            {
                "sifra": t["sifra"], "naziv": t["naziv"], "zbir": f(t["zbir"]),
                "pacijenti": [[p[0], *[round(c / 100, 2) for c in p[1:]]] for p in t["pacijenti"]],
            } for t in teams
        ],
        "kontrola": {
            "ispravno": all(c["ok"] for c in checks) and not warnings,
            "provjere": checks,
            "upozorenja": warnings[:200],
        },
    }


def _fmt(c: int) -> str:
    return f"{c / 100:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".")


def _validate(columns, teams, total) -> list[dict]:
    ncol = len(columns)
    idx = {k: i for i, k in enumerate(columns)}
    TOL = 2  # feninga, zbog zaokruzivanja u izvjestaju

    bad = []
    for t in teams:
        if t["zbir"] is None:
            bad.append(f"{t['naziv']}: nema reda sa zbirom tima")
            continue
        sums = [sum(p[1 + i] for p in t["pacijenti"]) for i in range(ncol)]
        for i in range(ncol):
            if abs(sums[i] - t["zbir"][i]) > TOL:
                bad.append(f"{t['naziv']} / {columns[i]}: pacijenti {_fmt(sums[i])} ≠ tim {_fmt(t['zbir'][i])}")
    checks = [{"naziv": "Zbir pacijenata = zbir tima", "ok": not bad, "detalji": bad[:30]}]

    bad = []
    if total is None:
        bad.append("Nije pronadjen red UKUPNO USTANOVA")
    else:
        for i in range(ncol):
            s = sum(t["zbir"][i] for t in teams if t["zbir"])
            if abs(s - total[i]) > TOL:
                bad.append(f"{columns[i]}: timovi {_fmt(s)} ≠ ustanova {_fmt(total[i])}")
    checks.append({"naziv": "Zbir timova = UKUPNO USTANOVA", "ok": not bad, "detalji": bad[:30]})

    have = lambda *ks: all(k in idx for k in ks)
    n1 = n2 = 0
    ex = []
    for t in teams:
        for p in t["pacijenti"]:
            v = p[1:]
            if have("ukupno", "fzo", "zus") and abs(v[idx["ukupno"]] - v[idx["fzo"]] - v[idx["zus"]]) > TOL:
                n1 += 1
                if len(ex) < 10:
                    ex.append(f"{p[0]} ({t['naziv']}): 1 ≠ 2 + 3")
            if have("zus", "efekti", "ino", "ksz_ped", "ksz_gin") and abs(
                    v[idx["zus"]] - sum(v[idx[k]] for k in ("efekti", "ino", "ksz_ped", "ksz_gin"))) > TOL:
                n2 += 1
                if len(ex) < 10:
                    ex.append(f"{p[0]} ({t['naziv']}): 3 ≠ 3a + 3b + 3c + 3d")
    det = []
    if n1:
        det.append(f"{n1} redova gdje 1 ≠ 2 + 3")
    if n2:
        det.append(f"{n2} redova gdje 3 ≠ 3a + 3b + 3c + 3d")
    checks.append({"naziv": "Formule po redu (1 = 2 + 3, 3 = 3a + 3b + 3c + 3d)",
                   "ok": not (n1 or n2), "detalji": det + ex})
    return checks


def report_id(data: dict) -> str:
    m = data["meta"]
    return f"{m.get('ustanova_sifra') or 'nepoznato'}_{m['period_od']}_{m['period_do']}"
