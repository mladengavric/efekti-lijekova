// Izvjestaji su kumulativni (od 1.1. do kraja mjeseca), pa se iznos za period
// dobija kao razlika dva uzastopna izvjestaja iste godine.

export type Check = { naziv: string; ok: boolean; detalji: string[] }
export type Meta = {
  kancelarija: string | null; ustanova_sifra: string | null; ustanova_naziv: string | null
  period_od: string; period_do: string; stampano: string | null
  izvorni_fajl: string | null; broj_strana: number; ekstraktovano: string
  broj_timova: number; broj_redova: number; broj_pacijenata: number
}
export type ReportSummary = {
  id: string; meta: Meta; kolone: string[]; ukupno: number[] | null
  kontrola: { ispravno: boolean; provjere: Check[]; upozorenja: string[] }
}
export type Report = ReportSummary & {
  timovi: { sifra: string | null; naziv: string; zbir: number[] | null; pacijenti: (string | number)[][] }[]
}

export const COL_INFO: Record<string, { title: string; short: string; code: string }> = {
  ukupno: { title: 'Ukupan trošak', short: 'Ukupno', code: '1' },
  fzo: { title: 'Trošak FZO RS', short: 'FZO RS', code: '2' },
  zus: { title: 'Trošak ZUS', short: 'ZUS', code: '3' },
  efekti: { title: 'Trošak lijekova za efekte', short: 'Efekti', code: '3a' },
  ino: { title: 'Trošak INO osiguranika', short: 'INO', code: '3b' },
  ksz_ped: { title: 'Trošak KSZ pedijatrija', short: 'KSZ pedijatrija', code: '3c' },
  ksz_gin: { title: 'Trošak KSZ ginekologija', short: 'KSZ ginekologija', code: '3d' },
  neprijavljeni: { title: 'Osiguranici koji nisu prijavljeni u tim', short: 'Neprijavljeni u tim', code: '4' },
}
export const colTitle = (k: string) => COL_INFO[k]?.title ?? k
export const colShort = (k: string) => COL_INFO[k]?.short ?? k

const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const fmtKM = (n: number) => nf2.format(n)
export const fmtInt = (n: number) => nf0.format(n)
export const fmtPct = (n: number) => (isFinite(n) ? nf1.format(n) + ' %' : '–')
export const fmtSigned = (n: number) => (isFinite(n) ? (n > 0 ? '+' : '') + nf1.format(n) + ' %' : '–')
export const fmtCompact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e6) return nf2.format(n / 1e6) + ' mil.'
  if (a >= 1e4) return nf0.format(n / 1e3) + ' hilj.'
  return nf0.format(n)
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']
type YMD = { y: number; m: number; d: number }
const ymd = (iso: string): YMD => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) })
export const fmtDate = (iso: string | null) => {
  if (!iso) return '–'
  const { y, m, d } = ymd(iso)
  const t = iso.length > 10 ? ' ' + iso.slice(11, 16) : ''
  return `${d}.${m}.${y}.${t}`
}

export type JmbgInfo = { dateOk: boolean; checksumOk: boolean; birth: YMD | null; sex: 'M' | 'Ž' | null; kind: string | null }
const SPECIAL_JMBG: [string, string][] = [
  ['5885', 'INO osiguranik'],
  ['8000', 'Privremeni/tehnički JMB'],
  ['4940', 'Strani pacijent sa privremenim JMB (PIO)'],
]
const jmbgCache = new Map<string, JmbgInfo>()
export function parseJmbg(j: string): JmbgInfo {
  let r = jmbgCache.get(j)
  if (r) return r
  r = { dateOk: false, checksumOk: false, birth: null, sex: null, kind: SPECIAL_JMBG.find(([p]) => j.startsWith(p))?.[1] ?? null }
  if (!r.kind && /^\d{13}$/.test(j)) {
    const g = j.split('').map(Number)
    const d = +j.slice(0, 2), m = +j.slice(2, 4), yyy = +j.slice(4, 7)
    const y = yyy >= 800 ? 1000 + yyy : 2000 + yyy
    const dt = new Date(y, m - 1, d)
    const now = new Date()
    if (m >= 1 && m <= 12 && d >= 1 && dt.getMonth() === m - 1 && dt.getDate() === d && dt <= now) {
      r.dateOk = true
      r.birth = { y, m, d }
      r.sex = +j.slice(9, 12) < 500 ? 'M' : 'Ž'
    }
    let k = 11 - ((7 * (g[0] + g[6]) + 6 * (g[1] + g[7]) + 5 * (g[2] + g[8]) + 4 * (g[3] + g[9]) + 3 * (g[4] + g[10]) + 2 * (g[5] + g[11])) % 11)
    if (k > 9) k = 0
    r.checksumOk = k === g[12]
  }
  jmbgCache.set(j, r)
  return r
}
export function ageAt(b: YMD, iso: string): number {
  const t = ymd(iso)
  let a = t.y - b.y
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) a--
  return a
}
export const AGE_GROUPS: [string, number, number][] = [
  ['0–6', 0, 6], ['7–18', 7, 18], ['19–34', 19, 34], ['35–49', 35, 49],
  ['50–64', 50, 64], ['65–74', 65, 74], ['75–84', 75, 84], ['85+', 85, 200],
]
export const ageGroupIdx = (age: number) => AGE_GROUPS.findIndex(([, lo, hi]) => age >= lo && age <= hi)

export type Period = { idx: number; label: string; from: string; to: string; months: number }
export type Team = { key: string; sifra: string | null; naziv: string; short: string }
export type Row = { jmbg: string; team: number; cum: (number[] | null)[] }
export type Dataset = {
  year: number; reports: Report[]; periods: Period[]; teams: Team[]; rows: Row[]; cols: string[]
}

export function buildDataset(year: number, reports: Report[]): Dataset {
  reports = [...reports].sort((a, b) => a.meta.period_do.localeCompare(b.meta.period_do))
  const cols = reports[reports.length - 1].kolone
  const periods: Period[] = reports.map((r, i) => {
    let from = r.meta.period_od
    if (i > 0) {
      const p = ymd(reports[i - 1].meta.period_do)
      const d = new Date(p.y, p.m - 1, p.d + 1)
      from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const f = ymd(from), t = ymd(r.meta.period_do)
    const months = Math.max(1, t.y * 12 + t.m - (f.y * 12 + f.m) + 1)
    const label = months === 1 ? MONTHS[t.m - 1] : `${MONTHS[f.m - 1]}–${MONTHS[t.m - 1]}`
    return { idx: i, label, from, to: r.meta.period_do, months }
  })

  const teamIdx = new Map<string, number>()
  const teams: Team[] = []
  const rowIdx = new Map<string, number>()
  const rows: Row[] = []
  for (let ri = reports.length - 1; ri >= 0; ri--) {
    const rep = reports[ri]
    const map = cols.map((c) => rep.kolone.indexOf(c))
    for (const t of rep.timovi) {
      const key = t.sifra ?? t.naziv
      let ti = teamIdx.get(key)
      if (ti === undefined) {
        ti = teams.length
        teamIdx.set(key, ti)
        teams.push({ key, sifra: t.sifra, naziv: t.naziv, short: t.naziv })
      }
      for (const p of t.pacijenti) {
        const jmbg = p[0] as string
        const rk = ti + '|' + jmbg
        let idx = rowIdx.get(rk)
        if (idx === undefined) {
          idx = rows.length
          rowIdx.set(rk, idx)
          rows.push({ jmbg, team: ti, cum: new Array(reports.length).fill(null) })
        }
        const vals = map.map((m) => (m >= 0 ? (p[m + 1] as number) : 0))
        const prev = rows[idx].cum[ri]
        rows[idx].cum[ri] = prev ? prev.map((v, i) => v + vals[i]) : vals
      }
    }
  }
  const prefCount = new Map<string, number>()
  const pref = (n: string) => { const i = n.lastIndexOf(' - '); return i > 0 ? n.slice(0, i) : '' }
  teams.forEach((t) => { const p = pref(t.naziv); if (p) prefCount.set(p, (prefCount.get(p) ?? 0) + 1) })
  const top = [...prefCount.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] > 1) teams.forEach((t) => { if (pref(t.naziv) === top[0]) t.short = t.naziv.slice(top[0].length + 3) })
  return { year, reports, periods, teams, rows, cols }
}

export type Filter = { a: number; b: number; teams: Set<number> | null; metric: number }

export const rangeVal = (r: Row, a: number, b: number, c: number) =>
  (r.cum[b]?.[c] ?? 0) - (a > 0 ? r.cum[a - 1]?.[c] ?? 0 : 0)

export const filteredRows = (ds: Dataset, f: Filter) =>
  f.teams ? ds.rows.filter((r) => f.teams!.has(r.team)) : ds.rows

export const rangeMonths = (ds: Dataset, f: Filter) =>
  ds.periods.slice(f.a, f.b + 1).reduce((s, p) => s + p.months, 0)

export const rangeLabel = (ds: Dataset, f: Filter) => {
  const a = ds.periods[f.a], b = ds.periods[f.b]
  const first = a.label.split('–')[0], last = b.label.split('–').pop()
  return (first === last ? first : `${first}–${last}`) + ' ' + ds.year
}

export function totals(ds: Dataset, f: Filter, rows = filteredRows(ds, f)): number[] {
  const out = new Array(ds.cols.length).fill(0)
  for (const r of rows) for (let c = 0; c < out.length; c++) out[c] += rangeVal(r, f.a, f.b, c)
  return out
}

export function periodTotals(ds: Dataset, rows: Row[]): number[][] {
  return ds.periods.map((p) => {
    const out = new Array(ds.cols.length).fill(0)
    for (const r of rows) for (let c = 0; c < out.length; c++) out[c] += rangeVal(r, p.idx, p.idx, c)
    return out
  })
}

export type Patient = {
  jmbg: string; teams: number[]; vals: number[]; last: number
  info: JmbgInfo; age: number | null
}
export function patients(ds: Dataset, f: Filter, rows = filteredRows(ds, f)): Patient[] {
  const m = new Map<string, Patient>()
  const asOf = ds.periods[f.b].to
  for (const r of rows) {
    const present = r.cum[f.b] != null
    const vals = ds.cols.map((_, c) => rangeVal(r, f.a, f.b, c))
    if (!present && vals.every((v) => Math.abs(v) < 0.005)) continue
    let p = m.get(r.jmbg)
    if (!p) {
      const info = parseJmbg(r.jmbg)
      p = { jmbg: r.jmbg, teams: [], vals: vals.map(() => 0), last: 0, info, age: info.birth ? ageAt(info.birth, asOf) : null }
      m.set(r.jmbg, p)
    }
    if (!p.teams.includes(r.team)) p.teams.push(r.team)
    for (let c = 0; c < vals.length; c++) p.vals[c] += vals[c]
    p.last += rangeVal(r, f.b, f.b, f.metric)
  }
  return [...m.values()]
}

export type TeamStat = { team: number; patients: number; vals: number[]; perPatient: number; share: number; dev: number }
export function teamStats(ds: Dataset, f: Filter): TeamStat[] {
  const rows = filteredRows(ds, f)
  const map = new Map<number, { set: Set<string>; vals: number[] }>()
  for (const r of rows) {
    const vals = ds.cols.map((_, c) => rangeVal(r, f.a, f.b, c))
    if (r.cum[f.b] == null && vals.every((v) => Math.abs(v) < 0.005)) continue
    let t = map.get(r.team)
    if (!t) { t = { set: new Set(), vals: vals.map(() => 0) }; map.set(r.team, t) }
    t.set.add(r.jmbg)
    for (let c = 0; c < vals.length; c++) t.vals[c] += vals[c]
  }
  let sum = 0, pat = 0
  map.forEach((t) => { sum += t.vals[f.metric]; pat += t.set.size })
  const avg = pat ? sum / pat : 0
  return [...map.entries()].map(([team, t]) => {
    const pp = t.set.size ? t.vals[f.metric] / t.set.size : 0
    return {
      team, patients: t.set.size, vals: t.vals, perPatient: pp,
      share: sum ? (t.vals[f.metric] / sum) * 100 : 0, dev: avg ? (pp / avg - 1) * 100 : 0,
    }
  }).sort((a, b) => b.vals[f.metric] - a.vals[f.metric])
}

export const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b), n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

export function periodPatientCounts(ds: Dataset, rows: Row[]) {
  const first = new Map<string, number>()
  const active = ds.periods.map(() => new Set<string>())
  for (const r of rows) {
    for (let k = 0; k < ds.periods.length; k++) {
      if (r.cum[k] != null && (first.get(r.jmbg) ?? 99) > k) first.set(r.jmbg, k)
      if (Math.abs(rangeVal(r, k, k, 0)) >= 0.005) active[k].add(r.jmbg)
    }
  }
  const fresh = ds.periods.map(() => 0)
  first.forEach((k) => fresh[k]++)
  return { active: active.map((s) => s.size), fresh }
}

export type NegDelta = { jmbg: string; team: number; period: number; deltas: number[] }
export type Vanished = { jmbg: string; team: number; period: number; lastCum: number[]; elsewhere: number[] }
export function anomalies(ds: Dataset, f: Filter) {
  const rows = filteredRows(ds, f)
  const neg: NegDelta[] = []
  const gone: Vanished[] = []
  const byJmbg = new Map<string, Row[]>()
  for (const r of ds.rows) { const l = byJmbg.get(r.jmbg); l ? l.push(r) : byJmbg.set(r.jmbg, [r]) }
  for (const r of rows) {
    for (let k = Math.max(1, f.a); k <= f.b; k++) {
      const prev = r.cum[k - 1], cur = r.cum[k]
      if (prev && !cur) {
        const elsewhere = (byJmbg.get(r.jmbg) ?? []).filter((o) => o !== r && o.cum[k] != null).map((o) => o.team)
        gone.push({ jmbg: r.jmbg, team: r.team, period: k, lastCum: prev, elsewhere })
      } else if (prev && cur) {
        const d = cur.map((v, c) => v - prev[c])
        if (d.some((v) => v < -0.005)) neg.push({ jmbg: r.jmbg, team: r.team, period: k, deltas: d })
      }
    }
  }
  const multi: { jmbg: string; teams: number[]; total: number }[] = []
  const seen = new Map<string, { teams: number[]; total: number }>()
  for (const r of rows) {
    const c = r.cum[f.b]
    if (!c) continue
    const e = seen.get(r.jmbg) ?? { teams: [], total: 0 }
    e.teams.push(r.team); e.total += c[0]
    seen.set(r.jmbg, e)
  }
  const bad: { jmbg: string; teams: number[]; total: number; reason: string }[] = []
  const special: typeof bad = []
  seen.forEach((e, jmbg) => {
    if (e.teams.length > 1) multi.push({ jmbg, ...e })
    const i = parseJmbg(jmbg)
    if (i.kind) special.push({ jmbg, ...e, reason: i.kind })
    else if (!i.dateOk || !i.checksumOk) {
      bad.push({
        jmbg, ...e,
        reason: !/^\d{13}$/.test(jmbg) ? 'Nije 13 cifara' : !i.dateOk ? 'Neispravan datum rođenja' : 'Neispravna kontrolna cifra',
      })
    }
  })
  return { neg, gone, multi, bad, special }
}
