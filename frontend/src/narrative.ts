import {
  AGE_GROUPS, ageGroupIdx, anomalies, colTitle, filteredRows, fmtInt, fmtKM, fmtPct, median, patients,
  periodTotals, rangeLabel, rangeMonths, teamStats, totals, type Dataset, type Filter,
} from './data'

export type Finding = { keys: string[]; text: string }

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10
  return `${fmtInt(n)} ${b === 1 && a !== 11 ? one : b >= 2 && b <= 4 && (a < 12 || a > 14) ? few : many}`
}
const pac = (n: number) => plural(n, 'pacijent', 'pacijenta', 'pacijenata')
const km = (v: number) => fmtKM(v) + ' KM'
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const MIN_PATIENTS = 20

export function narrative(ds: Dataset, f: Filter): Finding[] {
  const out: Finding[] = []
  const add = (keys: string[], text: string) => out.push({ keys, text })
  const m = f.metric
  const name = lower(colTitle(ds.cols[m]))
  const col = (k: string) => ds.cols.indexOf(k)
  const rows = filteredRows(ds, f)
  const tot = totals(ds, f, rows)
  const pats = patients(ds, f, rows)
  const stats = teamStats(ds, f)
  const months = rangeMonths(ds, f)
  const range = rangeLabel(ds, f)
  if (!pats.length) return out

  const vals = pats.map((p) => p.vals[m])
  add([], `U periodu ${range} ${name} iznosi ${km(tot[m])}, za ${pac(pats.length)} u ${plural(stats.length, 'timu', 'tima', 'timova')}. ` +
    `To je u prosjeku ${km(tot[m] / months)} mjesečno i ${km(tot[m] / pats.length)} po pacijentu (medijana ${km(median(vals))}).`)

  const u = col('ukupno'), fz = col('fzo'), zu = col('zus'), ef = col('efekti')
  if (u >= 0 && fz >= 0 && zu >= 0 && tot[u]) {
    add([], `Od ukupnog troška (${km(tot[u])}) na teret FZO RS pada ${km(tot[fz])} (${fmtPct((tot[fz] / tot[u]) * 100)}), ` +
      `a na teret zdravstvene ustanove ${km(tot[zu])} (${fmtPct((tot[zu] / tot[u]) * 100)})` +
      (ef >= 0 && tot[zu] ? `, od čega su lijekovi za efekte ${km(tot[ef])}.` : '.'))
  }

  const elapsed = ds.periods.slice(0, f.b + 1).reduce((s, p) => s + p.months, 0)
  if (f.a === 0 && elapsed < 12) {
    add([], `Ako se nastavi dosadašnji mjesečni prosjek, ${name} će do kraja ${ds.year}. godine iznositi oko ${km((tot[m] / elapsed) * 12)}.`)
  }

  const P = ds.periods.slice(f.a, f.b + 1)
  const pt = periodTotals(ds, rows)
  const avg = (k: number) => pt[k][m] / ds.periods[k].months
  if (P.length > 1) {
    const hi = P.reduce((x, p) => (avg(p.idx) > avg(x.idx) ? p : x))
    const lo = P.reduce((x, p) => (avg(p.idx) < avg(x.idx) ? p : x))
    const prev = avg(f.b - 1), d = prev ? (avg(f.b) / prev - 1) * 100 : 0
    add(['pregled', 'mjesecno'], `Najveći mjesečni prosjek zabilježen je u periodu ${hi.label} (${km(avg(hi.idx))}), a najmanji u periodu ${lo.label} (${km(avg(lo.idx))}). ` +
      `U posljednjem periodu (${ds.periods[f.b].label}) mjesečni prosjek je ${km(avg(f.b))}, što je ${fmtPct(Math.abs(d))} ${d >= 0 ? 'više' : 'manje'} nego u prethodnom (${ds.periods[f.b - 1].label}).`)
  }

  if (stats.length > 1) {
    const top = stats.slice(0, 3)
    const share = top.reduce((s, x) => s + x.share, 0)
    add(['pregled', 'timovi'], `Najveći trošak imaju timovi: ${top.map((s) => `${ds.teams[s.team].short} (${km(s.vals[m])}, ${fmtPct(s.share)})`).join('; ')}. ` +
      `Zajedno nose ${fmtPct(share)} troška.`)
    const big = stats.filter((s) => s.patients >= MIN_PATIENTS)
    if (big.length > 1) {
      const hi = big.reduce((x, s) => (s.perPatient > x.perPatient ? s : x))
      const lo = big.reduce((x, s) => (s.perPatient < x.perPatient ? s : x))
      const dev = (v: number) => `${fmtPct(Math.abs(v))} ${v >= 0 ? 'iznad' : 'ispod'} prosjeka`
      add(['timovi'], `Među timovima sa najmanje ${MIN_PATIENTS} pacijenata, najveći trošak po pacijentu ima ${ds.teams[hi.team].short} (${km(hi.perPatient)}, ${dev(hi.dev)}), ` +
        `a najmanji ${ds.teams[lo.team].short} (${km(lo.perPatient)}, ${dev(lo.dev)}).`)
    }
  }

  const sorted = [...vals].sort((a, b) => b - a)
  const sum = sorted.reduce((s, v) => s + v, 0)
  if (sum > 0) {
    const top = (q: number) => {
      const n = Math.max(1, Math.round(sorted.length * q))
      return { n, share: (sorted.slice(0, n).reduce((s, v) => s + v, 0) / sum) * 100 }
    }
    const t1 = top(0.01), t10 = top(0.1)
    add(['pacijenti'], `Trošak je koncentrisan na mali broj pacijenata: najskupljih 1 % (${pac(t1.n)}) nosi ${fmtPct(t1.share)} troška, a najskupljih 10 % (${pac(t10.n)}) nosi ${fmtPct(t10.share)}. ` +
      `Najveći trošak jednog pacijenta je ${km(sorted[0])}.`)
  }

  const known = pats.filter((p) => p.age != null && p.info.sex && ageGroupIdx(p.age) >= 0)
  if (known.length && sum > 0) {
    const share = (xs: typeof known) => fmtPct((xs.reduce((s, p) => s + p.vals[m], 0) / sum) * 100)
    const women = known.filter((p) => p.info.sex === 'Ž'), old = known.filter((p) => p.age! >= 65)
    const groups = AGE_GROUPS.map((g, i) => {
      const xs = known.filter((p) => ageGroupIdx(p.age!) === i)
      return { label: g[0], n: xs.length, pp: xs.length ? xs.reduce((s, p) => s + p.vals[m], 0) / xs.length : 0 }
    }).filter((g) => g.n >= MIN_PATIENTS)
    const best = groups.length ? groups.reduce((x, g) => (g.pp > x.pp ? g : x)) : null
    add(['demografija'], `Žene čine ${fmtPct((women.length / known.length) * 100)} pacijenata i nose ${share(women)} troška. ` +
      `Pacijenti od 65 i više godina čine ${fmtPct((old.length / known.length) * 100)} pacijenata, a nose ${share(old)} troška.` +
      (best ? ` Najveći trošak po pacijentu ima starosna grupa ${best.label} godina (${km(best.pp)}).` : ''))
  }

  if (u >= 0 && zu >= 0) {
    const sh = P.filter((p) => pt[p.idx][u]).map((p) => ({ p, v: (pt[p.idx][zu] / pt[p.idx][u]) * 100 }))
    const all = teamStats(ds, { ...f, metric: u }).filter((s) => s.patients >= MIN_PATIENTS && s.vals[u] > 0)
    let text = ''
    if (sh.length > 1) {
      const hi = sh.reduce((x, s) => (s.v > x.v ? s : x)), lo = sh.reduce((x, s) => (s.v < x.v ? s : x))
      text = `Udio troška na teret ustanove (ZUS) u ukupnom trošku kretao se od ${fmtPct(lo.v)} (${lo.p.label}) do ${fmtPct(hi.v)} (${hi.p.label}).`
    }
    if (all.length > 1) {
      const zs = (s: (typeof all)[number]) => (s.vals[zu] / s.vals[u]) * 100
      const hi = all.reduce((x, s) => (zs(s) > zs(x) ? s : x))
      text += `${text ? ' ' : ''}Najveći udio ZUS ima ${ds.teams[hi.team].short} (${fmtPct(zs(hi))} troška tima).`
    }
    if (text) add(['struktura'], text)
  }

  const an = anomalies(ds, f)
  const moved = an.gone.filter((g) => g.elsewhere.length).length
  add(['anomalije'], `Kontrola podataka: negativnih mjesečnih razlika (storna i korekcije) ima ${fmtInt(an.neg.length)}; ` +
    `iz tima je nestalo ${pac(an.gone.length)}, od čega se ${fmtInt(moved)} sada vodi u drugom timu; ` +
    `u više timova istovremeno vodi se ${pac(an.multi.length)}; neispravan JMBG ima ${pac(an.bad.length)}, a poseban JMB (INO osiguranici i privremeni brojevi) ${pac(an.special.length)}.`)

  return out
}
