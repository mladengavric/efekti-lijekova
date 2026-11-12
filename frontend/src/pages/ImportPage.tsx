import { Fragment, useEffect, useRef, useState } from 'react'
import { api, type ImportResult, type NameRow } from '../api'
import { fmtDate, fmtInt, fmtKM, type ReportSummary } from '../data'
import { Card } from '../components/Chart'

function Status({ r }: { r: ReportSummary }) {
  const failed = r.kontrola.provjere.filter((c) => !c.ok).length
  if (failed) return <span className="badge bad">✕ {failed} provjera ne prolazi</span>
  if (r.kontrola.upozorenja.length) return <span className="badge warn">! {r.kontrola.upozorenja.length} upozorenja</span>
  return <span className="badge ok">✓ Ispravno</span>
}

function Checks({ r }: { r: ReportSummary }) {
  return (
    <ul className="checks">
      {r.kontrola.provjere.map((c, i) => (
        <li key={i}>
          {c.ok ? '✓' : '✕'} {c.naziv}
          {c.detalji.map((d, k) => <div className="det" key={k}>{d}</div>)}
        </li>
      ))}
      {r.kontrola.upozorenja.map((w, i) => <li key={'w' + i}>! {w}</li>)}
    </ul>
  )
}

const SUSPECT = /t(?=[bcčćdđfghklmnpsšzž])|f(?=[bcčćdđfghkmnpsštvzž])/

function Names({ reports, reload }: { reports: ReportSummary[]; reload: () => void }) {
  const [rows, setRows] = useState<NameRow[] | null>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.names().then((r) => { setRows(r); setEdit(Object.fromEntries(r.map((x) => [x.pdf, x.naziv]))) }).catch((e) => setMsg(e.message))
  }, [reports])
  if (!rows || !rows.length) return null
  const dirty = rows.some((r) => (edit[r.pdf] ?? '').trim() !== r.naziv)
  const save = () => {
    setBusy(true); setMsg('')
    api.saveNames(edit)
      .then((r) => { setMsg(`Sačuvano. Izmijenjeno izvještaja: ${r.izmijenjeno_izvjestaja}.`); reload() })
      .catch((e) => setMsg(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <Card title="Nazivi ustanova i timova"
      note="FZO RS PDF ponekad izgubi slovo „i” iza „t” ili „f” (npr. „Svet Luka” umjesto „Sveti Luka”). Česte riječi se ispravljaju same; ostale nazive ispravite ovdje. Ispravka se primjenjuje na sve uvezene izvještaje i na svaki budući uvoz."
      actions={<button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Čuvam…' : 'Sačuvaj ispravke'}</button>}>
      {msg && <p className="note" style={{ marginBottom: 8 }}>{msg}</p>}
      <div className="dt-scroll">
        <table className="names">
          <thead>
            <tr>
              {['Vrsta', 'Šifra', 'Naziv iz PDF-a', 'Naziv u aplikaciji', ''].map((h, i) => <th className="plain" key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = edit[r.pdf] ?? ''
              return (
                <tr key={r.vrsta + r.pdf}>
                  <td>{r.vrsta === 'ustanova' ? 'Ustanova' : 'Tim'}</td>
                  <td>{r.sifra ?? '–'}</td>
                  <td>{r.pdf}</td>
                  <td><input className="name-input" value={v} aria-label={'Naziv za ' + r.pdf}
                    onChange={(e) => setEdit({ ...edit, [r.pdf]: e.target.value })} /></td>
                  <td>
                    {v.trim() && v.trim() !== r.pdf
                      ? <span className="badge ok">Ispravljeno</span>
                      : SUSPECT.test(r.pdf) ? <span className="badge warn" title="Možda nedostaje slovo „i” iza „t” ili „f”">Provjerite</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function ImportPage({ reports, reload }: { reports: ReportSummary[]; reload: () => void }) {
  const [busy, setBusy] = useState('')
  const [over, setOver] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function run(label: string, job: () => Promise<ImportResult[]>) {
    setBusy(label); setError(''); setResults([])
    try { setResults(await job()); reload() } catch (e: any) { setError(e.message) }
    setBusy('')
  }
  const upload = (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { setError('Izaberite PDF fajlove.'); return }
    run(`Obrada ${pdfs.length} ${pdfs.length === 1 ? 'fajla' : 'fajlova'}…`, () => api.importFiles(pdfs))
  }
  async function remove(r: ReportSummary) {
    if (!confirm(`Obrisati izvještaj za period ${fmtDate(r.meta.period_od)} – ${fmtDate(r.meta.period_do)}?\nBriše se samo izvučeni JSON; PDF ostaje netaknut.`)) return
    try { await api.remove(r.id); reload() } catch (e: any) { setError(e.message) }
  }

  return (
    <>
      <div
        className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]) }}
      >
        <strong>{busy || 'Prevucite PDF izvještaje ovdje'}</strong>
        {!busy && <span>Jedan ili više fajlova „Pregled propisanih lijekova po zdravstvenim ustanovama i timovima”. Period i ustanova čitaju se iz samog PDF-a.</span>}
        <div className="row">
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden
            onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = '' }} />
          <button className="btn primary" disabled={!!busy} onClick={() => input.current?.click()}>Izaberi PDF fajlove</button>
          <button className="btn" disabled={!!busy} onClick={() => run('Uvoz iz foldera data-pdf…', api.importFolder)}>
            Uvezi sve iz foldera data-pdf
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => (
            <li key={i}>
              <strong>{r.fajl}</strong>
              {r.ok && r.izvjestaj ? (
                <>
                  <Status r={r.izvjestaj} />
                  <span>{fmtDate(r.izvjestaj.meta.period_od)} – {fmtDate(r.izvjestaj.meta.period_do)}</span>
                  <span className="note">{fmtInt(r.izvjestaj.meta.broj_strana)} strana · {fmtInt(r.izvjestaj.meta.broj_pacijenata)} pacijenata{r.zamijenjen ? ' · zamijenjen postojeći' : ''}</span>
                </>
              ) : <span className="badge bad">✕ {r.greska}</span>}
            </li>
          ))}
        </ul>
      )}

      <Card title="Uvezeni izvještaji" note="Podaci se čuvaju kao JSON fajlovi u folderu data-json. Ponovni uvoz istog perioda zamjenjuje stari.">
        <div className="dt-scroll">
          <table>
            <thead>
              <tr>
                {['Period', 'Ustanova', 'Štampano', 'Izvorni fajl'].map((h) => <th className="plain" key={h}>{h}</th>)}
                {['Strana', 'Timova', 'Pacijenata', 'Ukupan trošak (KM)'].map((h) => <th className="plain num" key={h}>{h}</th>)}
                <th className="plain">Kontrola</th><th className="plain"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{fmtDate(r.meta.period_od)} – {fmtDate(r.meta.period_do)}</td>
                    <td>{r.meta.ustanova_sifra} {r.meta.ustanova_naziv}</td>
                    <td>{fmtDate(r.meta.stampano)}</td>
                    <td>{r.meta.izvorni_fajl}</td>
                    <td className="num">{fmtInt(r.meta.broj_strana)}</td>
                    <td className="num">{fmtInt(r.meta.broj_timova)}</td>
                    <td className="num">{fmtInt(r.meta.broj_pacijenata)}</td>
                    <td className="num">{r.ukupno ? fmtKM(r.ukupno[0]) : '–'}</td>
                    <td><Status r={r} /></td>
                    <td>
                      <button className="btn small" onClick={() => setOpen(open === r.id ? null : r.id)}>Provjere</button>{' '}
                      <a className="btn small" href={'/api/reports/' + r.id} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>JSON</a>{' '}
                      <button className="btn small danger" onClick={() => remove(r)}>Obriši</button>
                    </td>
                  </tr>
                  {open === r.id && <tr><td colSpan={10} style={{ whiteSpace: 'normal' }}><Checks r={r} /></td></tr>}
                </Fragment>
              ))}
              {!reports.length && <tr><td colSpan={10} className="empty">Još nema uvezenih izvještaja.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ height: 16 }} />
      <Names reports={reports} reload={reload} />
    </>
  )
}
