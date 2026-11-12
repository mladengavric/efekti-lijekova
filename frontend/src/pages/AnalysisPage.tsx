import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import {
  buildDataset, colTitle, rangeLabel, type Dataset, type Filter, type Report, type ReportSummary,
} from '../data'
import { useTheme, type Theme } from '../components/Chart'
import ReportView from './ReportView'
import { Pregled, Mjesecno, Timovi } from '../tabs/tabs1'
import { Pacijenti, Demografija, Struktura, Anomalije } from '../tabs/tabs2'

export type Ctx = { ds: Dataset; f: Filter; t: Theme; years: Dataset[]; print?: 'main' | 'tables' }

const REPORT = 'izvjestaj'
const readHash = () => decodeURIComponent(location.hash.slice(1))

const TABS = [
  ['pregled', 'Pregled', Pregled], ['mjesecno', 'Po mjesecima', Mjesecno], ['timovi', 'Timovi', Timovi],
  ['pacijenti', 'Pacijenti', Pacijenti], ['demografija', 'Demografija', Demografija],
  ['struktura', 'Struktura troška', Struktura], ['anomalije', 'Anomalije', Anomalije],
] as const

function TeamPicker({ ds, value, onChange }: { ds: Dataset; value: Set<number> | null; onChange: (v: Set<number> | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const n = ds.teams.length
  const sel = value ?? new Set(ds.teams.map((_, i) => i))
  const toggle = (i: number) => {
    const s = new Set(sel)
    s.has(i) ? s.delete(i) : s.add(i)
    onChange(s.size === n ? null : s)
  }
  return (
    <div className="multi field" ref={ref}>
      Timovi
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {value == null ? `Svi timovi (${n})` : value.size === 1 ? ds.teams[[...value][0]].short : `${value.size} od ${n} timova`} ▾
      </button>
      {open && (
        <div className="multi-pop">
          <div className="multi-actions">
            <button className="btn small" onClick={() => onChange(null)}>Svi</button>
            <button className="btn small" onClick={() => onChange(new Set())}>Nijedan</button>
          </div>
          {ds.teams.map((t, i) => (
            <label key={t.key}>
              <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} />
              {t.sifra ? `${t.sifra} – ` : ''}{t.naziv}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AnalysisPage({ reports, version }: { reports: ReportSummary[]; version: number }) {
  const t = useTheme()
  const ustanove = useMemo(() => {
    const m = new Map<string, string>()
    reports.forEach((r) => m.set(r.meta.ustanova_sifra ?? 'nepoznato', r.meta.ustanova_naziv ?? 'Nepoznata ustanova'))
    return [...m.entries()]
  }, [reports])
  const [ustanova, setUstanova] = useState(ustanove[0]?.[0])
  const [data, setData] = useState<Report[] | null>(null)
  const [error, setError] = useState('')
  const [year, setYear] = useState<number | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [teams, setTeams] = useState<Set<number> | null>(null)
  const [metric, setMetric] = useState(0)
  const [hash, setHash] = useState(readHash)
  const lastTab = useRef('pregled')
  const report = hash === REPORT
  const tab = TABS.some(([k]) => k === hash) ? hash : report ? lastTab.current : 'pregled'
  lastTab.current = tab
  const setTab = (k: string) => { history.replaceState(null, '', '#' + k); setHash(k) }

  useEffect(() => {
    const h = () => setHash(readHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  useEffect(() => {
    if (!ustanove.some(([k]) => k === ustanova)) setUstanova(ustanove[0]?.[0])
  }, [ustanove, ustanova])
  useEffect(() => {
    if (!ustanova) return
    let live = true
    api.dataset(ustanova)
      .then((d) => { if (live) { setData(d); setError('') } })
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [ustanova, version])

  const years = useMemo(() => {
    if (!data) return []
    const by = new Map<number, Report[]>()
    data.forEach((r) => {
      const y = +r.meta.period_do.slice(0, 4)
      by.set(y, [...(by.get(y) ?? []), r])
    })
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([y, rs]) => buildDataset(y, rs))
  }, [data])

  const ds = years.find((d) => d.year === year) ?? years[years.length - 1]
  useEffect(() => { setRange(null); setTeams(null); setMetric(0) }, [ds?.year, ustanova])

  if (error) return <div className="error">{error}</div>
  if (!ds) return <div className="emptystate">{data ? 'Nema podataka za izabranu ustanovu.' : 'Učitavanje podataka…'}</div>

  const last = ds.periods.length - 1
  const a = Math.min(range?.[0] ?? 0, last)
  const b = Math.min(Math.max(range?.[1] ?? last, a), last)
  const f: Filter = { a, b, teams, metric: Math.min(metric, ds.cols.length - 1) }
  const ctx: Ctx = { ds, f, t, years }
  const [, , Tab] = TABS.find(([k]) => k === tab)!

  if (report) return <ReportView ctx={ctx} onClose={() => { location.hash = lastTab.current }} />

  return (
    <>
      <div className="topbar">
      <div className="filters">
        {ustanove.length > 1 && (
          <label>Ustanova
            <select value={ustanova} onChange={(e) => setUstanova(e.target.value)}>
              {ustanove.map(([k, n]) => <option key={k} value={k}>{k} {n}</option>)}
            </select>
          </label>
        )}
        <label>Godina
          <select value={ds.year} onChange={(e) => setYear(+e.target.value)}>
            {years.map((y) => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
        </label>
        <label>Period od
          <select value={a} onChange={(e) => setRange([+e.target.value, Math.max(b, +e.target.value)])}>
            {ds.periods.map((p) => <option key={p.idx} value={p.idx}>{p.label}</option>)}
          </select>
        </label>
        <label>Period do
          <select value={b} onChange={(e) => setRange([Math.min(a, +e.target.value), +e.target.value])}>
            {ds.periods.map((p) => <option key={p.idx} value={p.idx}>{p.label}</option>)}
          </select>
        </label>
        <TeamPicker ds={ds} value={teams} onChange={setTeams} />
        <label>Pokazatelj
          <select value={f.metric} onChange={(e) => setMetric(+e.target.value)}>
            {ds.cols.map((c, i) => <option key={c} value={i}>{colTitle(c)}</option>)}
          </select>
        </label>
        <div className="summary">
          {ds.reports[0].meta.ustanova_naziv}<br />
          {rangeLabel(ds, f)} · iznosi u KM
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        <button className="btn primary print-btn" onClick={() => { location.hash = REPORT }} title="Pregled izvještaja za štampu ili snimanje u PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 9V4h10v5 M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2 M7 14h10v6H7z" />
          </svg>
          Štampa / PDF
        </button>
      </div>
      </div>
      {teams && teams.size === 0
        ? <div className="emptystate">Izaberite bar jedan tim.</div>
        : <Tab {...ctx} />}
    </>
  )
}
