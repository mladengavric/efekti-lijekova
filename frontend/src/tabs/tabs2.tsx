import { useMemo, useState } from 'react'
import type { Ctx } from '../pages/AnalysisPage'
import {
  AGE_GROUPS, ageAt, ageGroupIdx, anomalies, colShort, colTitle, filteredRows, fmtCompact, fmtInt, fmtKM, fmtPct,
  parseJmbg, patients, periodTotals, rangeLabel, rangeVal, teamStats,
  type Dataset, type NegDelta, type Patient, type TeamStat, type Vanished,
} from '../data'
import { base, Card, catAxis, Chart, Kpi, KpiRow, tip, valAxis } from '../components/Chart'
import { DataTable, type Col } from '../components/DataTable'
import { chartH, deps, fewTicks, teamAxis } from './tabs1'

const km = (v: unknown) => fmtKM(Number(v)) + ' KM'
const pct = (v: unknown) => fmtPct(Number(v))
const teamNames = (ds: Dataset, ts: number[]) => ts.map((i) => ds.teams[i].short).join(', ')
const Jmbg = ({ v }: { v: string }) => <span className="mono">{v}</span>

const BINS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, Infinity]

function PatientModal({ ds, jmbg, onClose, c }: { ds: Dataset; jmbg: string; onClose: () => void; c: Ctx }) {
  const rows = ds.rows.filter((r) => r.jmbg === jmbg)
  const info = parseJmbg(jmbg)
  const asOf = ds.periods[ds.periods.length - 1].to
  const m = c.f.metric
  type R = { team: number; p: number; d: number[]; cum: number[] | null }
  const table: R[] = []
  rows.forEach((r) => ds.periods.forEach((p) => {
    const d = ds.cols.map((_, i) => rangeVal(r, p.idx, p.idx, i))
    if (r.cum[p.idx] || d.some((v) => Math.abs(v) >= 0.005)) table.push({ team: r.team, p: p.idx, d, cum: r.cum[p.idx] })
  }))
  table.sort((a, b) => a.p - b.p || a.team - b.team)
  const option = base(c.t, {
    legend: { show: false },
    tooltip: tip(c.t, { valueFormatter: km }),
    xAxis: catAxis(c.t, ds.periods.map((p) => p.label)),
    yAxis: valAxis(c.t, fmtCompact),
    series: [{
      type: 'bar', barMaxWidth: 28, color: c.t.series[0], itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: ds.periods.map((p) => rows.reduce((s, r) => s + rangeVal(r, p.idx, p.idx, m), 0)),
    }],
  })
  const cols: Col<R>[] = [
    { title: 'Period', value: (r) => r.p, render: (r) => `${ds.periods[r.p].label} ${ds.year}` },
    { title: 'Tim', value: (r) => ds.teams[r.team].naziv },
    ...ds.cols.map((k, i): Col<R> => ({ title: colShort(k), value: (r) => r.d[i], num: true })),
    { title: 'Kumulativno (ukupno)', value: (r) => r.cum?.[0] ?? null, num: true },
  ]
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={'Pacijent ' + jmbg}>
        <div className="modal-head">
          <div>
            <h2>Pacijent <Jmbg v={jmbg} /></h2>
            <p className="note">
              {info.birth
                ? `Rođen/a ${info.birth.d}.${info.birth.m}.${info.birth.y}. · ${ageAt(info.birth, asOf)} god. · pol ${info.sex}`
                : info.kind ?? 'JMBG nema ispravan datum rođenja'}
              {' · '}{teamNames(ds, [...new Set(rows.map((r) => r.team))])}
            </p>
          </div>
          <button className="btn" onClick={onClose}>Zatvori</button>
        </div>
        <Card title={`${colTitle(ds.cols[m])} po periodima`} note={`Zbir po periodu, svi timovi, ${ds.year}.`}>
          <Chart option={option} height={220} />
        </Card>
        <div style={{ height: 14 }} />
        <DataTable columns={cols} rows={table} exportName={`pacijent-${jmbg}`} pageSize={30} />
      </div>
    </div>
  )
}

export function Pacijenti(c: Ctx) {
  const { ds, f, t } = c
  const m = f.metric
  const [open, setOpen] = useState<string | null>(null)
  const d = useMemo(() => {
    const pats = patients(ds, f).sort((a, b) => b.vals[m] - a.vals[m])
    const total = pats.reduce((s, p) => s + p.vals[m], 0)
    const share = (q: number) => {
      const n = Math.max(1, Math.round(pats.length * q))
      return total ? (pats.slice(0, n).reduce((s, p) => s + p.vals[m], 0) / total) * 100 : 0
    }
    const hist = BINS.slice(0, -1).map(() => ({ n: 0, sum: 0 }))
    let zero = 0
    for (const p of pats) {
      const v = p.vals[m]
      if (v < 0.005) { zero++; continue }
      const i = Math.min(hist.length - 1, BINS.findIndex((_, k) => v >= BINS[k] && v < BINS[k + 1]))
      hist[i].n++; hist[i].sum += v
    }
    const lorenz: [number, number][] = [[0, 0]]
    let acc = 0
    const step = Math.max(1, Math.floor(pats.length / 200))
    pats.forEach((p, i) => {
      acc += p.vals[m]
      if ((i + 1) % step === 0 || i === pats.length - 1) lorenz.push([((i + 1) / pats.length) * 100, total ? (acc / total) * 100 : 0])
    })
    return { pats, total, share, hist, zero, lorenz }
  }, deps(c))
  const name = colTitle(ds.cols[m])
  const binLabel = (i: number) => (BINS[i + 1] === Infinity ? `${fmtInt(BINS[i])}+` : `${fmtInt(BINS[i])}–${fmtInt(BINS[i + 1])}`)

  const hist = useMemo(() => base(t, {
    legend: { show: false },
    tooltip: tip(t, {
      formatter: (ps: any) => {
        const h = d.hist[ps[0].dataIndex]
        return `<b>${binLabel(ps[0].dataIndex)} KM</b><br/>Pacijenata: ${fmtInt(h.n)}<br/>Zbir: ${km(h.sum)} (${pct((h.sum / (d.total || 1)) * 100)})`
      },
    }),
    xAxis: catAxis(t, d.hist.map((_, i) => binLabel(i))),
    yAxis: valAxis(t, fmtInt),
    series: [{
      type: 'bar', barMaxWidth: 40, color: t.series[0], itemStyle: { borderRadius: [4, 4, 0, 0] }, data: d.hist.map((h) => h.n),
      label: { show: true, position: 'top', color: t.text2, fontSize: 11, formatter: (p: any) => fmtInt(p.value) },
    }],
  }), [...deps(c), d])

  const lorenz = useMemo(() => base(t, {
    legend: { show: false },
    tooltip: tip(t, {
      axisPointer: { type: 'line' },
      formatter: (ps: any) => `Najskupljih ${pct(ps[0].value[0])} pacijenata<br/>nosi <b>${pct(ps[0].value[1])}</b> troška`,
    }),
    xAxis: { ...valAxis(t, (v) => v + ' %'), min: 0, max: 100, name: 'udio pacijenata (od najskupljih)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: t.muted, fontSize: 11 } },
    yAxis: { ...valAxis(t, (v) => v + ' %'), min: 0, max: 100 },
    grid: { left: 8, right: 16, top: 16, bottom: 28, containLabel: true },
    series: [
      { type: 'line', data: d.lorenz, showSymbol: false, lineStyle: { width: 2 }, color: t.series[0], areaStyle: { opacity: 0.08 } },
      { type: 'line', data: [[0, 0], [100, 100]], showSymbol: false, silent: true, lineStyle: { width: 1, type: 'dashed', color: t.muted }, tooltip: { show: false } },
    ],
  }), [...deps(c), d])

  const lastLabel = ds.periods[f.b].label
  const cols: Col<Patient>[] = [
    { title: 'JMBG', value: (p) => p.jmbg, render: (p) => <Jmbg v={p.jmbg} /> },
    { title: 'Tim', value: (p) => teamNames(ds, p.teams) },
    { title: 'Pol', value: (p) => p.info.sex },
    { title: 'Starost', value: (p) => p.age, num: true, fmt: fmtInt },
    ...ds.cols.map((k, i): Col<Patient> => ({ title: colShort(k), value: (p) => p.vals[i], num: true })),
    { title: 'Udio', value: (p) => (d.total ? (p.vals[m] / d.total) * 100 : 0), num: true, fmt: (v) => fmtPct(v).replace(' %', '') + ' %' },
    { title: `U periodu ${lastLabel}`, value: (p) => p.last, num: true },
  ]

  if (c.print === 'tables') return null
  const H = chartH(c)
  return (
    <>
      <KpiRow>
        <Kpi label="Pacijenata" value={fmtInt(d.pats.length)} sub={d.zero ? `${fmtInt(d.zero)} bez troška u ovom pokazatelju` : rangeLabel(ds, f)} />
        {[0.01, 0.05, 0.1, 0.2].map((q) => (
          <Kpi key={q} label={`Najskupljih ${q * 100} %${c.print ? '' : ' pacijenata'}`} value={fmtPct(d.share(q))} sub={`troška · ${fmtInt(Math.max(1, Math.round(d.pats.length * q)))} pacijenata`} />
        ))}
      </KpiRow>
      <div className="grid g2">
        <Card title="Raspodjela pacijenata po visini troška" note={`${name} po pacijentu (KM), ${rangeLabel(ds, f)}`}>
          <Chart option={hist} height={H} />
        </Card>
        <Card title="Koncentracija troška" note="Koliki dio troška nosi koji dio pacijenata; isprekidana linija bi značila ravnomjernu raspodjelu">
          <Chart option={lorenz} height={H} />
        </Card>
      </div>
      {!c.print && (
        <Card title="Svi pacijenti" note={`Kliknite na red za istoriju pacijenta po mjesecima. Sortirano po: ${colShort(ds.cols[m])}.`}>
          <DataTable columns={cols} rows={d.pats} search={(p) => p.jmbg + ' ' + teamNames(ds, p.teams)}
            exportName={`pacijenti-${ds.year}`} onRowClick={(p) => setOpen(p.jmbg)} pageSize={25} />
        </Card>
      )}
      {open && <PatientModal ds={ds} jmbg={open} onClose={() => setOpen(null)} c={c} />}
    </>
  )
}

export function Demografija(c: Ctx) {
  const { ds, f, t } = c
  const m = f.metric
  const d = useMemo(() => {
    const pats = patients(ds, f)
    const g = AGE_GROUPS.map(() => ({ M: { n: 0, sum: 0 }, Ž: { n: 0, sum: 0 } }))
    let unknown = 0, unknownSum = 0, total = 0
    const perTeam = new Map<number, { n: number; age: number; f: number; old: number; sum: number }>()
    for (const p of pats) {
      total += p.vals[m]
      if (p.age == null || !p.info.sex) { unknown++; unknownSum += p.vals[m]; continue }
      const gi = ageGroupIdx(p.age)
      if (gi < 0) { unknown++; unknownSum += p.vals[m]; continue }
      g[gi][p.info.sex].n++; g[gi][p.info.sex].sum += p.vals[m]
      for (const ti of p.teams) {
        const e = perTeam.get(ti) ?? { n: 0, age: 0, f: 0, old: 0, sum: 0 }
        e.n++; e.age += p.age; e.sum += p.vals[m] / p.teams.length
        if (p.info.sex === 'Ž') e.f++
        if (p.age >= 65) e.old++
        perTeam.set(ti, e)
      }
    }
    return { g, unknown, unknownSum, total, perTeam, n: pats.length }
  }, deps(c))
  const name = colTitle(ds.cols[m])
  const labels = AGE_GROUPS.map((a) => a[0])
  const grouped = (get: (x: { n: number; sum: number }) => number, fmt: (v: unknown) => string, axisFmt: (n: number) => string) => base(t, {
    tooltip: tip(t, { valueFormatter: fmt }),
    xAxis: catAxis(t, labels),
    yAxis: valAxis(t, axisFmt),
    series: (['M', 'Ž'] as const).map((s, i) => ({
      type: 'bar' as const, barMaxWidth: 22, name: s === 'M' ? 'Muškarci' : 'Žene', color: t.series[i],
      itemStyle: { borderRadius: [4, 4, 0, 0] }, data: d.g.map((x) => get(x[s])),
    })),
  })
  const cost = useMemo(() => grouped((x) => x.sum, km, fmtCompact), [...deps(c), d])
  const count = useMemo(() => grouped((x) => x.n, (v) => fmtInt(Number(v)), fmtInt), [...deps(c), d])
  const avg = useMemo(() => grouped((x) => (x.n ? x.sum / x.n : 0), km, fmtCompact), [...deps(c), d])

  type G = { i: number }
  const sum = (i: number) => d.g[i].M.sum + d.g[i].Ž.sum, n = (i: number) => d.g[i].M.n + d.g[i].Ž.n
  const gcols: Col<G>[] = [
    { title: 'Starosna grupa', value: (r) => r.i, render: (r) => labels[r.i] },
    { title: 'Muškaraca', value: (r) => d.g[r.i].M.n, num: true, fmt: fmtInt },
    { title: 'Žena', value: (r) => d.g[r.i].Ž.n, num: true, fmt: fmtInt },
    { title: 'Ukupno pacijenata', value: (r) => n(r.i), num: true, fmt: fmtInt },
    { title: 'Udio pacijenata', value: (r) => (n(r.i) / (d.n || 1)) * 100, num: true, fmt: fmtPct },
    { title: `${colShort(ds.cols[m])} – muškarci`, value: (r) => d.g[r.i].M.sum, num: true },
    { title: `${colShort(ds.cols[m])} – žene`, value: (r) => d.g[r.i].Ž.sum, num: true },
    { title: colShort(ds.cols[m]), value: (r) => sum(r.i), num: true },
    { title: 'Udio troška', value: (r) => (sum(r.i) / (d.total || 1)) * 100, num: true, fmt: fmtPct },
    { title: 'Po pacijentu', value: (r) => (n(r.i) ? sum(r.i) / n(r.i) : 0), num: true },
  ]
  type T = { team: number; n: number; age: number; f: number; old: number; sum: number }
  const trows: T[] = [...d.perTeam.entries()].map(([team, e]) => ({ team, ...e }))
  const tcols: Col<T>[] = [
    { title: 'Tim', value: (r) => ds.teams[r.team].naziv },
    { title: 'Pacijenata', value: (r) => r.n, num: true, fmt: fmtInt },
    { title: 'Prosječna starost', value: (r) => r.age / r.n, num: true, fmt: (v) => v.toFixed(1).replace('.', ',') },
    { title: 'Žena', value: (r) => (r.f / r.n) * 100, num: true, fmt: fmtPct },
    { title: '65 i više godina', value: (r) => (r.old / r.n) * 100, num: true, fmt: fmtPct },
    { title: `${colShort(ds.cols[m])} po pacijentu`, value: (r) => r.sum / r.n, num: true },
  ]

  if (c.print === 'tables') return null
  const H = chartH(c)
  return (
    <>
      <p className="note keep-next" style={{ marginBottom: 12 }}>
        Pol i datum rođenja čitaju se iz JMBG-a; starost je na kraj izabranog perioda.
        {d.unknown > 0 && ` Za ${fmtInt(d.unknown)} pacijenata (${fmtKM(d.unknownSum)} KM) pol i starost se ne mogu pročitati (INO osiguranici, privremeni JMB ili neispravan broj), pa nisu uključeni.`}
      </p>
      <div className="grid g2">
        <Card title="Trošak po starosti i polu" note={`${name}, ${rangeLabel(ds, f)}`}><Chart option={cost} height={H} /></Card>
        <Card title="Broj pacijenata po starosti i polu"><Chart option={count} height={H} /></Card>
      </div>
      <div className={c.print ? 'grid' : 'grid g2'}>
        <Card title="Prosječan trošak po pacijentu" note={`${name} / broj pacijenata u grupi`}><Chart option={avg} height={H} /></Card>
        <Card title="Starosne grupe">
          <DataTable columns={gcols} rows={labels.map((_, i) => ({ i }))} exportName={`demografija-${ds.year}`} />
        </Card>
      </div>
      <Card title="Demografija po timovima" note="Pacijent koji se vodi u više timova broji se u svakom, a trošak mu se dijeli ravnomjerno">
        <DataTable columns={tcols} rows={trows} exportName={`demografija-timovi-${ds.year}`} pageSize={c.print ? 500 : 30} sort={{ col: 1, desc: true }} />
      </Card>
    </>
  )
}

export function Struktura(c: Ctx) {
  const { ds, f, t } = c
  const d = useMemo(() => {
    const rows = filteredRows(ds, f)
    return { stats: teamStats(ds, { ...f, metric: 0 }), pt: periodTotals(ds, rows) }
  }, deps(c))
  const ci = (k: string) => ds.cols.indexOf(k)
  const u = ci('ukupno'), fz = ci('fzo'), zu = ci('zus')
  const P = ds.periods.slice(f.a, f.b + 1)
  const stats = d.stats.filter((s) => Math.abs(s.vals[u]) > 0.005)

  const share = useMemo(() => base(t, {
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    tooltip: tip(t, {
      formatter: (ps: any) => {
        const s = stats[ps[0].dataIndex]
        return `<b>${ds.teams[s.team].naziv}</b><br/>FZO RS: ${km(s.vals[fz])} (${pct((s.vals[fz] / s.vals[u]) * 100)})<br/>ZUS: ${km(s.vals[zu])} (${pct((s.vals[zu] / s.vals[u]) * 100)})`
      },
    }),
    xAxis: { ...valAxis(t, (v) => v + ' %', fewTicks(c, 4)), max: 100 },
    yAxis: teamAxis(c, stats.map((s) => ds.teams[s.team].short)),
    series: [fz, zu].map((k, i) => ({
      type: 'bar' as const, stack: 's', barMaxWidth: 16, name: colShort(ds.cols[k]), color: t.series[i],
      itemStyle: { borderColor: t.surface, borderWidth: 1 },
      data: stats.map((s) => Math.round((s.vals[k] / s.vals[u]) * 1000) / 10),
    })),
  }), [...deps(c), d])

  const trend = useMemo(() => base(t, {
    legend: { show: false },
    tooltip: tip(t, { valueFormatter: pct, axisPointer: { type: 'line' } }),
    xAxis: catAxis(t, P.map((p) => p.label), { boundaryGap: false }),
    yAxis: { ...valAxis(t, (v) => v + ' %'), min: 0, max: 100 },
    series: [{
      type: 'line', name: 'Udio ZUS u ukupnom trošku', color: t.series[1], symbolSize: 8, lineStyle: { width: 2 },
      data: P.map((p) => (d.pt[p.idx][u] ? Math.round((d.pt[p.idx][zu] / d.pt[p.idx][u]) * 1000) / 10 : 0)),
      label: { show: true, position: 'top', color: t.text2, fontSize: 11, formatter: (p: any) => pct(p.value) },
    }],
  }), [...deps(c), d])

  const cols: Col<TeamStat>[] = [
    { title: 'Tim', value: (s) => ds.teams[s.team].naziv, minWidth: 200 },
    ...ds.cols.flatMap((k, i): Col<TeamStat>[] => [
      { title: colShort(k), value: (s) => s.vals[i], num: true },
      ...(i === u ? [] : [{ title: `% ${colShort(k)}`, value: (s: TeamStat) => (s.vals[u] ? (s.vals[i] / s.vals[u]) * 100 : 0), num: true, fmt: fmtPct }]),
    ]),
  ]
  if (u < 0 || fz < 0 || zu < 0) return <div className="emptystate">Izvještaj nema kolone Ukupno / FZO RS / ZUS.</div>
  const table = (
    <Card title="Struktura troška po timovima" note="Procenat je udio stavke u ukupnom trošku tima">
      <DataTable columns={cols} rows={d.stats} exportName={`struktura-${ds.year}`} pageSize={c.print ? 500 : 30} />
    </Card>
  )
  if (c.print === 'tables') return <div className="grid">{table}</div>
  return (
    <>
      <div className="grid g2">
        <Card title="Odnos FZO RS i ZUS po timovima" note={`Udio u ukupnom trošku tima, ${rangeLabel(ds, f)}`}>
          <Chart option={share} height={Math.max(220, stats.length * (c.print ? 19 : 22) + 50)} />
        </Card>
        <Card title="Udio ZUS u ukupnom trošku kroz vrijeme" note="Dio troška koji pada na teret zdravstvene ustanove, po periodu">
          <Chart option={trend} height={chartH(c)} />
        </Card>
      </div>
      {!c.print && table}
    </>
  )
}

export function Anomalije(c: Ctx) {
  const { ds, f } = c
  const d = useMemo(() => anomalies(ds, f), deps(c))
  const [open, setOpen] = useState<string | null>(null)
  const per = (k: number) => `${ds.periods[k].label} ${ds.year}`
  const jm = <T extends { jmbg: string }>(): Col<T> => ({ title: 'JMBG', value: (r) => r.jmbg, render: (r) => <Jmbg v={r.jmbg} /> })

  const negCols: Col<NegDelta>[] = [
    jm(), { title: 'Tim', value: (r) => ds.teams[r.team].short }, { title: 'Period', value: (r) => r.period, render: (r) => per(r.period) },
    ...ds.cols.map((k, i): Col<NegDelta> => ({ title: colShort(k), value: (r) => r.deltas[i], num: true })),
  ]
  const goneCols: Col<Vanished>[] = [
    jm(), { title: 'Tim', value: (r) => ds.teams[r.team].short },
    { title: 'Nema ga od', value: (r) => r.period, render: (r) => per(r.period) },
    { title: 'Posljednji kumulativ (ukupno)', value: (r) => r.lastCum[0], num: true },
    { title: 'Sada se vodi u timu', value: (r) => (r.elsewhere.length ? teamNames(ds, r.elsewhere) : null) },
  ]
  type M = { jmbg: string; teams: number[]; total: number; reason?: string }
  const multiCols: Col<M>[] = [
    jm(), { title: 'Timovi', value: (r) => teamNames(ds, r.teams) },
    { title: 'Broj timova', value: (r) => r.teams.length, num: true, fmt: fmtInt },
    { title: 'Ukupan trošak (kumulativno)', value: (r) => r.total, num: true },
  ]
  const specialCols: Col<M>[] = [
    jm(), { title: 'Vrsta', value: (r) => r.reason ?? '' }, { title: 'Tim', value: (r) => teamNames(ds, r.teams) },
    { title: 'Ukupan trošak (kumulativno)', value: (r) => r.total, num: true },
  ]
  const badCols: Col<M>[] = [
    jm(), { title: 'Razlog', value: (r) => r.reason ?? '' }, { title: 'Tim', value: (r) => teamNames(ds, r.teams) },
    { title: 'Ukupan trošak (kumulativno)', value: (r) => r.total, num: true },
  ]
  const s = (r: { jmbg: string }) => r.jmbg
  const click = (r: { jmbg: string }) => setOpen(r.jmbg)
  const moved = d.gone.filter((g) => g.elsewhere.length).length

  const size = c.print ? 25 : 10
  const negCard = (
    <Card title="Negativne mjesečne razlike" note="Kumulativni iznos pacijenta je manji nego u prethodnom izvještaju. Prikazane su razlike po kolonama (KM).">
      <DataTable columns={negCols} rows={d.neg} search={s} onRowClick={click} exportName="negativne-razlike" pageSize={size}
        sort={{ col: 3, desc: false }} empty="Nema negativnih razlika u izabranom opsegu." />
    </Card>
  )
  if (c.print === 'tables') return <div className="grid">{negCard}</div>
  return (
    <>
      <KpiRow>
        <Kpi label="Negativne mjesečne razlike" value={fmtInt(d.neg.length)} sub="storna i korekcije" />
        <Kpi label="Nestali iz tima" value={fmtInt(d.gone.length)} sub={`${fmtInt(moved)} prešlo u drugi tim`} />
        <Kpi label="U više timova" value={fmtInt(d.multi.length)} sub={`stanje na kraju perioda ${ds.periods[f.b].label}`} />
        <Kpi label="Posebni JMB" value={fmtInt(d.special.length)} sub="INO i privremeni brojevi" />
        <Kpi label="Neispravan JMBG" value={fmtInt(d.bad.length)} sub="datum ili kontrolna cifra" />
      </KpiRow>
      <div className="grid">
        {!c.print && negCard}
        <Card title="Pacijenti koji su nestali iz tima" note="Postojali su u prethodnom izvještaju, a u sljedećem ih u tom timu nema. Njihov raniji trošak izlazi iz kumulativa tima.">
          <DataTable columns={goneCols} rows={d.gone} search={s} onRowClick={click} exportName="nestali-iz-tima" pageSize={size}
            sort={{ col: 3, desc: true }} empty="Nema takvih pacijenata u izabranom opsegu." />
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Pacijenti u više timova" note="Isti JMBG se u posljednjem izvještaju opsega vodi u dva ili više timova">
          <DataTable columns={multiCols} rows={d.multi} search={s} onRowClick={click} exportName="vise-timova" pageSize={size} sort={{ col: 3, desc: true }} />
        </Card>
        <Card title="Posebni JMB" note="Nisu greška: INO osiguranici (5885), privremeni/tehnički brojevi (8000) i strani pacijenti sa privremenim JMB od PIO (4940). Iz njih se ne čitaju pol i starost.">
          <DataTable columns={specialCols} rows={d.special} search={s} onRowClick={click} exportName="posebni-jmb" pageSize={size} sort={{ col: 3, desc: true }}
            empty="Nema takvih pacijenata." />
        </Card>
      </div>
      <div className="grid">
        <Card title="Neispravan JMBG" note="Datum rođenja ili kontrolna cifra nisu ispravni">
          <DataTable columns={badCols} rows={d.bad} search={s} onRowClick={click} exportName="neispravan-jmbg" pageSize={size} sort={{ col: 3, desc: true }}
            empty="Nema neispravnih JMBG." />
        </Card>
      </div>
      {open && <PatientModal ds={ds} jmbg={open} onClose={() => setOpen(null)} c={c} />}
    </>
  )
}
