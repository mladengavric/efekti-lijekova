import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ctx } from './AnalysisPage'
import { savePdf } from '../api'
import { colTitle, fmtDate, rangeLabel } from '../data'
import { LIGHT } from '../components/Chart'
import { narrative } from '../narrative'
import { Pregled, Mjesecno, Timovi } from '../tabs/tabs1'
import { Pacijenti, Demografija, Struktura, Anomalije } from '../tabs/tabs2'

const SECTIONS = [
  { key: 'pregled', label: 'Pregled', C: Pregled, tables: false },
  { key: 'mjesecno', label: 'Po mjesecima', C: Mjesecno, tables: true },
  { key: 'timovi', label: 'Timovi', C: Timovi, tables: true },
  { key: 'pacijenti', label: 'Pacijenti', C: Pacijenti, tables: false },
  { key: 'demografija', label: 'Demografija', C: Demografija, tables: false },
  { key: 'struktura', label: 'Struktura troška', C: Struktura, tables: true },
  { key: 'anomalije', label: 'Anomalije', C: Anomalije, tables: true },
]

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const PRINTER = 'M7 9V4h10v5 M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2 M7 14h10v6H7z'
const DOWNLOAD = 'M12 4v11 M7.5 11 12 15.5 16.5 11 M5 20h14'

export default function ReportView({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { ds, f } = ctx
  const paper: Ctx = { ...ctx, t: LIGHT }
  const [picked, setPicked] = useState(() => new Set(SECTIONS.map((s) => s.key)))
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meta = ds.reports[f.b].meta
  const period = rangeLabel(ds, f)
  const name = `Analiza propisanih lijekova - ${meta.ustanova_naziv ?? ''} - ${period}`

  useEffect(() => {
    const title = document.title
    document.title = name
    return () => { document.title = title }
  }, [name])

  const findings = useMemo(() => narrative(ds, f), [ds, f.a, f.b, f.teams, f.metric])
  const shown = SECTIONS.filter((s) => picked.has(s.key))
  const all = shown.length === SECTIONS.length
  const toggle = (k: string) => {
    const s = new Set(picked)
    s.has(k) ? s.delete(k) : s.add(k)
    setPicked(s)
  }
  const now = new Date()
  const today = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}.`
  const teamText = f.teams == null ? `svi (${ds.teams.length})` : [...f.teams].map((i) => ds.teams[i].short).join(', ')
  const text = findings.filter((x) => !x.keys.length || x.keys.some((k) => picked.has(k)))
  const tables = shown.filter((s) => s.tables)
  const empty = f.teams != null && f.teams.size === 0
  const blocked = !shown.length || empty

  const save = () => {
    if (!ref.current) return
    setSaving(true)
    savePdf(name, ref.current).catch((e) => alert(e.message)).finally(() => setSaving(false))
  }

  return (
    <>
      <div className="report-top no-print">
        <div className="report-bar">
          <button className="btn ghost" onClick={onClose}>‹ Nazad na analizu</button>
          <fieldset className="rep-pick">
            <span className="rep-pick-title">Sadržaj izvještaja:</span>
            <label>
              <input type="checkbox" checked={all} onChange={() => setPicked(new Set(all ? [] : SECTIONS.map((s) => s.key)))} />
              <b>Sve</b>
            </label>
            {SECTIONS.map((s) => (
              <label key={s.key}>
                <input type="checkbox" checked={picked.has(s.key)} onChange={() => toggle(s.key)} />
                {s.label}
              </label>
            ))}
          </fieldset>
          <div className="rep-actions">
            <button className="btn icon" disabled={blocked} onClick={() => window.print()}><Icon d={PRINTER} />Štampaj</button>
            <button className="btn primary icon" disabled={blocked || saving} onClick={save}>
              <Icon d={DOWNLOAD} />{saving ? 'Pravim PDF…' : 'Sačuvaj PDF'}
            </button>
          </div>
        </div>
      </div>
      <div className="report" ref={ref}>
        <div className="sheet">
          <header className="rep-head">
            <h1>Analiza propisanih lijekova</h1>
            <p className="rep-sub">{meta.ustanova_naziv}</p>
            <p className="rep-sub2">Period: {period}{all ? '' : ` · ${shown.map((s) => s.label).join(', ')}`}</p>
            <p className="rep-meta">
              Pokazatelj: {colTitle(ds.cols[f.metric])} · Timovi: {teamText} · Iznosi u KM ·
              Izvor: izvještaj FZO RS štampan {fmtDate(meta.stampano)} · Analiza sačinjena {today}
            </p>
          </header>
          {blocked
            ? <div className="emptystate">{empty ? 'Izaberite bar jedan tim.' : 'Izaberite bar jednu analizu.'}</div>
            : (
              <>
                <h2 className="rep-title">Tekstualna analiza</h2>
                <ul className="findings">
                  {text.map((x, i) => <li key={i}>{x.text}</li>)}
                </ul>
                {shown.map((s) => (
                  <section key={s.key}>
                    <h2 className="rep-title">{s.label}</h2>
                    <s.C {...paper} print="main" />
                  </section>
                ))}
              </>
            )}
        </div>
        {!blocked && tables.length > 0 && (
          <div className="sheet wide">
            <h2 className="rep-title">Tabelarni prilog</h2>
            {tables.map((s) => <s.C key={s.key} {...paper} print="tables" />)}
          </div>
        )}
      </div>
    </>
  )
}
