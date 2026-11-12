import { useMemo, useState } from 'react'
import type { Ctx } from '../pages/AnalysisPage'
import {
  colShort, colTitle, filteredRows, fmtCompact, fmtInt, fmtKM, fmtPct, fmtSigned, median, patients,
  periodPatientCounts, periodTotals, rangeLabel, rangeMonths, rangeVal, teamStats, totals,
  type Dataset, type Row, type TeamStat,
} from '../data'
import { base, Card, catAxis, Chart, Kpi, KpiRow, tip, valAxis } from '../components/Chart'
import { DataTable, type Col } from '../components/DataTable'

export const deps = (c: Ctx) => [c.ds, c.f.a, c.f.b, c.f.teams, c.f.metric, c.t]
export const chartH = (c: Ctx, screen = 300, print = 215) => (c.print ? print : screen)
export const teamAxis = (c: Ctx, names: string[]) => catAxis(c.t, names, {
  inverse: true,
  ...(c.print ? { axisLabel: { color: c.t.muted, fontSize: 10, width: 104, overflow: 'truncate' } } : {}),
})
export const fewTicks = (c: Ctx, n = 3) => (c.print ? { splitNumber: n } : {})
const km = (v: unknown) => fmtKM(Number(v)) + ' KM'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']
const bar = (color?: string) => ({ type: 'bar' as const, barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0], ...(color ? { color } : {}) } })

export function Pregled(c: Ctx) {
  const { ds, f, t } = c
  const m = f.metric
  const d = useMemo(() => {
    const rows = filteredRows(ds, f)
    const tot = totals(ds, f, rows)
    const pats = patients(ds, f, rows)
    const vals = pats.map((p) => p.vals[m])
    const pt = periodTotals(ds, rows)
    return { tot, pats, vals, pt, stats: teamStats(ds, f) }
  }, deps(c))

  const col = (k: string) => ds.cols.indexOf(k)
  const months = rangeMonths(ds, f)
  const P = ds.periods.slice(f.a, f.b + 1)
  const avg = (k: number) => d.pt[k][m] / ds.periods[k].months
  const delta = f.b > 0 ? (avg(f.b - 1) ? (avg(f.b) / avg(f.b - 1) - 1) * 100 : null) : null
  const elapsed = ds.periods.slice(0, f.b + 1).reduce((s, p) => s + p.months, 0)
  const projection = f.a === 0 && elapsed < 12 ? (d.tot[m] / elapsed) * 12 : null
  const name = colTitle(ds.cols[m])

  const monthly = useMemo(() => base(t, {
    legend: { show: false },
    tooltip: tip(t, {
      formatter: (ps: any) => {
        const p = ds.periods[f.a + ps[0].dataIndex]
        return `<b>${p.label} ${ds.year}</b><br/>Mjesečni prosjek: ${km(ps[0].value)}` +
          (p.months > 1 ? `<br/>Ukupno za ${p.months} mjeseca: ${km(d.pt[p.idx][m])}` : '')
      },
    }),
    xAxis: catAxis(t, P.map((p) => p.label)),
    yAxis: valAxis(t, fmtCompact),
    series: [{ ...bar(t.series[0]), name, data: P.map((p) => avg(p.idx)) }],
  }), [...deps(c), d])

  const cumul = useMemo(() => {
    let s = 0
    return base(t, {
      legend: { show: false },
      tooltip: tip(t, { valueFormatter: km, axisPointer: { type: 'line' } }),
      xAxis: catAxis(t, P.map((p) => p.label.split('–').pop()!), { boundaryGap: false }),
      yAxis: valAxis(t, fmtCompact),
      series: [{
        type: 'line', name: 'Kumulativno', lineStyle: { width: 2 }, symbolSize: 8, color: t.series[0],
        areaStyle: { opacity: 0.08 }, data: P.map((p) => (s += d.pt[p.idx][m])),
      }],
    })
  }, [...deps(c), d])

  const top = d.stats.slice(0, 10)
  const topTeams = useMemo(() => base(t, {
    legend: { show: false },
    grid: { left: 8, right: c.print ? 52 : 70, top: 8, bottom: 8, containLabel: true },
    tooltip: tip(t, { valueFormatter: km }),
    xAxis: valAxis(t, fmtCompact, fewTicks(c)),
    yAxis: teamAxis(c, top.map((s) => ds.teams[s.team].short)),
    series: [{
      type: 'bar', barMaxWidth: 16, name, color: t.series[0], itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: top.map((s) => s.vals[m]),
      label: { show: true, position: 'right', color: t.text2, fontSize: 11, formatter: (p: any) => fmtCompact(p.value) },
    }],
  }), [...deps(c), d])

  const base0 = d.tot[col('ukupno')] || d.tot[0]
  if (c.print === 'tables') return null
  const H = chartH(c)
  return (
    <>
      <KpiRow>
        <Kpi label={name} value={fmtKM(d.tot[m])} sub={rangeLabel(ds, f)} />
        {['fzo', 'zus', 'efekti'].filter((k) => col(k) >= 0 && col(k) !== m).map((k) => (
          <Kpi key={k} label={colTitle(k)} value={fmtKM(d.tot[col(k)])} sub={fmtPct((d.tot[col(k)] / base0) * 100) + ' ukupnog troška'} />
        ))}
        <Kpi label="Pacijenata" value={fmtInt(d.pats.length)} sub="jedinstvenih JMBG" />
        <Kpi label="Prosjek po pacijentu" value={fmtKM(d.pats.length ? d.tot[m] / d.pats.length : 0)} sub={'medijana ' + fmtKM(median(d.vals))} />
        <Kpi label="Mjesečni prosjek" value={fmtKM(d.tot[m] / months)} delta={delta}
          sub={delta != null ? `${ds.periods[f.b].label} prema ${ds.periods[f.b - 1].label}` : `${months} mj.`} />
        {projection != null && <Kpi label={`Projekcija za ${ds.year}.`} value={fmtKM(projection)} sub="linearno, po dosadašnjem prosjeku" accent />}
      </KpiRow>
      <div className="grid g2">
        <Card title={`${name} po mjesecima`} note="Period od više mjeseci prikazan je kao mjesečni prosjek, da bi stubići bili uporedivi.">
          <Chart option={monthly} height={H} />
        </Card>
        <Card title="Kumulativno kroz godinu" note={`${name}, zbir od početka izabranog opsega`}>
          <Chart option={cumul} height={H} />
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Timovi sa najvećim troškom" note={`${name}, ${rangeLabel(ds, f)}`}>
          <Chart option={topTeams} height={Math.max(180, top.length * (c.print ? 21 : 30) + 30)} />
        </Card>
        <Card title="Struktura troška" note="Udio svake stavke u ukupnom trošku (kolona 1)">
          <div className="bars">
            {ds.cols.map((k, i) => (
              <div className="bar-row" key={k}>
                <span>{colShort(k)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(0, Math.min(100, (d.tot[i] / base0) * 100)) + '%' }} /></div>
                <span className="num">{fmtKM(d.tot[i])} · {fmtPct((d.tot[i] / base0) * 100)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

function yearCumulative(yd: Dataset, keys: Set<string> | null, colKey: string): (number | null)[] {
  const ci = yd.cols.indexOf(colKey)
  const out: (number | null)[] = new Array(12).fill(null)
  if (ci < 0) return out
  const rows = keys ? yd.rows.filter((r) => keys.has(yd.teams[r.team].key)) : yd.rows
  yd.periods.forEach((p, k) => {
    let s = 0
    for (const r of rows) s += r.cum[k]?.[ci] ?? 0
    out[+p.to.slice(5, 7) - 1] = s
  })
  return out
}

export function Mjesecno(c: Ctx) {
  const { ds, f, t, years } = c
  const m = f.metric
  const d = useMemo(() => {
    const rows = filteredRows(ds, f)
    return { pt: periodTotals(ds, rows), pc: periodPatientCounts(ds, rows) }
  }, deps(c))
  const P = ds.periods.slice(f.a, f.b + 1)
  const fi = ds.cols.indexOf('fzo'), zi = ds.cols.indexOf('zus')
  const name = colTitle(ds.cols[m])

  const stacked = useMemo(() => base(t, {
    tooltip: tip(t, { valueFormatter: km }),
    xAxis: catAxis(t, P.map((p) => p.label)),
    yAxis: valAxis(t, fmtCompact),
    series: [fi, zi].filter((i) => i >= 0).map((ci, i) => ({
      type: 'bar' as const, stack: 's', barMaxWidth: 34, name: colShort(ds.cols[ci]), color: t.series[i],
      itemStyle: { borderColor: t.surface, borderWidth: 1, borderRadius: i === 1 ? [4, 4, 0, 0] : 0 },
      data: P.map((p) => d.pt[p.idx][ci] / p.months),
    })),
  }), [...deps(c), d])

  const counts = useMemo(() => base(t, {
    tooltip: tip(t, { valueFormatter: (v: unknown) => fmtInt(Number(v)) }),
    xAxis: catAxis(t, P.map((p) => p.label)),
    yAxis: valAxis(t, fmtInt),
    series: [
      { ...bar(t.series[0]), name: 'Pacijenti sa troškom', data: P.map((p) => d.pc.active[p.idx]) },
      { ...bar(t.series[1]), name: 'Novi pacijenti', data: P.map((p) => d.pc.fresh[p.idx]) },
    ],
  }), [...deps(c), d])

  const yoy = useMemo(() => {
    const keys = f.teams ? new Set([...f.teams].map((i) => ds.teams[i].key)) : null
    const ys = years.slice(-8)
    return base(t, {
      tooltip: tip(t, { valueFormatter: (v: unknown) => (v == null ? '–' : km(v)), axisPointer: { type: 'line' } }),
      xAxis: catAxis(t, MONTHS, { boundaryGap: false }),
      yAxis: valAxis(t, fmtCompact),
      series: ys.map((yd, i) => ({
        type: 'line' as const, name: String(yd.year), connectNulls: true, symbolSize: 8, color: t.series[i],
        lineStyle: { width: 2 }, data: yearCumulative(yd, keys, ds.cols[m]),
      })),
    })
  }, [...deps(c), years])

  type R = { p: number }
  const cols: Col<R>[] = [
    { title: 'Period', value: (r) => r.p, render: (r) => `${ds.periods[r.p].label} ${ds.year}` },
    { title: 'Mjeseci', value: (r) => ds.periods[r.p].months, num: true, fmt: fmtInt },
    ...ds.cols.map((k, i): Col<R> => ({ title: colShort(k), value: (r) => d.pt[r.p][i], num: true })),
    { title: `Mjesečni prosjek (${colShort(ds.cols[m])})`, value: (r) => d.pt[r.p][m] / ds.periods[r.p].months, num: true },
    {
      title: 'Promjena prosjeka', num: true, fmt: fmtSigned,
      value: (r) => {
        if (r.p === 0) return null
        const prev = d.pt[r.p - 1][m] / ds.periods[r.p - 1].months
        return prev ? ((d.pt[r.p][m] / ds.periods[r.p].months) / prev - 1) * 100 : null
      },
    },
    { title: 'Pacijenata sa troškom', value: (r) => d.pc.active[r.p], num: true, fmt: fmtInt },
    { title: 'Novih pacijenata', value: (r) => d.pc.fresh[r.p], num: true, fmt: fmtInt },
  ]

  const H = chartH(c)
  const table = (
    <Card title="Tabela po periodima" note="Iznos perioda = razlika dva uzastopna kumulativna izvještaja">
      <DataTable columns={cols} rows={P.map((p) => ({ p: p.idx }))} exportName={`po-mjesecima-${ds.year}`} pageSize={24} />
    </Card>
  )
  if (c.print === 'tables') return <div className="grid">{table}</div>
  return (
    <>
      <div className="grid g2">
        <Card title="FZO RS i ZUS po mjesecima" note="Mjesečni prosjek po periodu; stubić je zbir FZO RS + ZUS = ukupan trošak">
          <Chart option={stacked} height={H} />
        </Card>
        <Card title="Broj pacijenata po periodu" note="Novi pacijenti se prvi put pojavljuju u izvještaju; prvi period uključuje sve od početka godine">
          <Chart option={counts} height={H} />
        </Card>
      </div>
      <div className="grid">
        <Card title="Poređenje godina" note={`${name}, kumulativno od 1. januara${years.length < 2 ? '. Trenutno postoje podaci samo za jednu godinu; nove godine se dodaju same kad uvezete njihove izvještaje.' : ''}`}>
          <Chart option={yoy} height={H} />
        </Card>
        {!c.print && table}
      </div>
    </>
  )
}

function teamPeriodMatrix(ds: Dataset, rows: Row[], m: number) {
  const out = new Map<number, number[]>()
  for (const r of rows) {
    let a = out.get(r.team)
    if (!a) { a = ds.periods.map(() => 0); out.set(r.team, a) }
    for (let k = 0; k < a.length; k++) a[k] += rangeVal(r, k, k, m)
  }
  return out
}

export function Timovi(c: Ctx) {
  const { ds, f, t } = c
  const m = f.metric
  const [mode, setMode] = useState<'total' | 'pp'>('total')
  const [picked, setPicked] = useState<string[] | null>(null)
  const d = useMemo(() => {
    const rows = filteredRows(ds, f)
    return { stats: teamStats(ds, f), mat: teamPeriodMatrix(ds, rows, m) }
  }, deps(c))
  const P = ds.periods.slice(f.a, f.b + 1)
  const name = colTitle(ds.cols[m])
  const label = (i: number) => ds.teams[i].short

  const sorted = useMemo(
    () => [...d.stats].sort((x, y) => (mode === 'pp' ? y.perPatient - x.perPatient : y.vals[m] - x.vals[m])),
    [d, mode, m])
  const avgPP = useMemo(() => {
    const s = d.stats.reduce((a, x) => a + x.vals[m], 0), n = d.stats.reduce((a, x) => a + x.patients, 0)
    return n ? s / n : 0
  }, [d, m])

  const rank = useMemo(() => base(t, {
    legend: { show: false },
    grid: { left: 8, right: c.print ? 52 : 80, top: 8, bottom: 8, containLabel: true },
    tooltip: tip(t, {
      formatter: (ps: any) => {
        const s = sorted[ps[0].dataIndex]
        return `<b>${ds.teams[s.team].naziv}</b><br/>${name}: ${km(s.vals[m])}<br/>Pacijenata: ${fmtInt(s.patients)}` +
          `<br/>Po pacijentu: ${km(s.perPatient)} (${fmtSigned(s.dev)} od prosjeka)`
      },
    }),
    xAxis: valAxis(t, fmtCompact, fewTicks(c)),
    yAxis: teamAxis(c, sorted.map((s) => label(s.team))),
    series: [{
      type: 'bar', barMaxWidth: 16, color: t.series[0], itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: sorted.map((s) => (mode === 'pp' ? s.perPatient : s.vals[m])),
      label: { show: true, position: 'right', color: t.text2, fontSize: 11, formatter: (p: any) => (mode === 'pp' ? fmtKM(p.value) : fmtCompact(p.value)) },
      markLine: mode === 'pp' ? {
        symbol: 'none', silent: true, lineStyle: { color: t.muted, type: 'dashed' },
        label: { formatter: 'prosjek ustanove', color: t.muted, fontSize: 11 }, data: [{ xAxis: avgPP }],
      } : undefined,
    }],
  }), [...deps(c), sorted, mode, avgPP])

  const heat = useMemo(() => {
    const ts = d.stats.map((s) => s.team)
    const data: [number, number, number][] = []
    let max = 0
    ts.forEach((ti, y) => P.forEach((p, x) => {
      const v = (d.mat.get(ti)?.[p.idx] ?? 0) / p.months
      max = Math.max(max, v)
      data.push([x, y, Math.round(v * 100) / 100])
    }))
    return base(t, {
      legend: { show: false },
      grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
      tooltip: tip(t, {
        trigger: 'item',
        formatter: (p: any) => `<b>${ds.teams[ts[p.value[1]]].naziv}</b><br/>${P[p.value[0]].label} ${ds.year}: ${km(p.value[2])} mjesečno`,
      }),
      xAxis: catAxis(t, P.map((p) => p.label), { splitArea: { show: false } }),
      yAxis: teamAxis(c, ts.map(label)),
      visualMap: {
        min: 0, max: max || 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 4, itemHeight: 220, itemWidth: 10,
        inRange: { color: [t.neutral, ...t.seq] }, textStyle: { color: t.muted, fontSize: 11 },
        formatter: (v: any) => fmtCompact(Number(v)),
      },
      series: [{
        type: 'heatmap', data, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
      }],
    })
  }, [...deps(c), d])

  const defaults = d.stats.slice(0, 5).map((s) => ds.teams[s.team].key)
  const sel = (picked ?? defaults).filter((k) => d.stats.some((s) => ds.teams[s.team].key === k))
  const trend = useMemo(() => base(t, {
    tooltip: tip(t, { valueFormatter: km, axisPointer: { type: 'line' } }),
    xAxis: catAxis(t, P.map((p) => p.label), { boundaryGap: false }),
    yAxis: valAxis(t, fmtCompact),
    series: sel.map((k, i) => {
      const ti = ds.teams.findIndex((x) => x.key === k)
      return {
        type: 'line' as const, name: label(ti), color: t.series[i], symbolSize: 8, lineStyle: { width: 2 },
        data: P.map((p) => (d.mat.get(ti)?.[p.idx] ?? 0) / p.months),
        endLabel: { show: sel.length <= 4, formatter: '{a}', color: t.text2, fontSize: 11 },
      }
    }),
  }), [...deps(c), d, sel.join('|')])
  const togglePick = (k: string) =>
    setPicked(sel.includes(k) ? sel.filter((x) => x !== k) : sel.length < 8 ? [...sel, k] : sel)

  const cols: Col<TeamStat>[] = [
    { title: 'Šifra', value: (s) => ds.teams[s.team].sifra },
    { title: 'Tim', value: (s) => ds.teams[s.team].naziv, minWidth: 190 },
    { title: 'Pacijenata', value: (s) => s.patients, num: true, fmt: fmtInt },
    { title: colShort(ds.cols[m]), value: (s) => s.vals[m], num: true },
    { title: 'Udio', value: (s) => s.share, num: true, fmt: fmtPct },
    { title: 'Po pacijentu', value: (s) => s.perPatient, num: true },
    { title: 'Odstupanje od prosjeka', value: (s) => s.dev, num: true, fmt: fmtSigned },
    ...ds.cols.map((k, i): Col<TeamStat> => ({ title: colShort(k), value: (s) => s.vals[i], num: true })).filter((_, i) => i !== m),
  ]

  const rowH = c.print ? 19 : 22
  const table = (
    <Card title="Tabela timova" note="Odstupanje: trošak po pacijentu u odnosu na prosjek izabranih timova">
      <DataTable columns={cols} rows={d.stats} exportName={`timovi-${ds.year}`} pageSize={c.print ? 500 : 30} />
    </Card>
  )
  if (c.print === 'tables') return <div className="grid">{table}</div>
  return (
    <>
      <div className="grid g2">
        <Card title="Rang lista timova" note={mode === 'pp' ? `${name} po pacijentu; isprekidana linija je prosjek ustanove` : `${name}, ${rangeLabel(ds, f)}`}
          actions={
            <div className="chips" style={{ margin: 0 }}>
              <button className={'chip' + (mode === 'total' ? ' on' : '')} onClick={() => setMode('total')}>Ukupno</button>
              <button className={'chip' + (mode === 'pp' ? ' on' : '')} onClick={() => setMode('pp')}>Po pacijentu</button>
            </div>
          }>
          <Chart option={rank} height={Math.max(200, sorted.length * rowH + 30)} />
        </Card>
        <Card title="Tim × period" note={`${name}, mjesečni prosjek; jača plava = veći trošak`}>
          <Chart option={heat} height={Math.max(240, d.stats.length * rowH + 90)} />
        </Card>
      </div>
      <div className="grid">
        <Card title="Kretanje po timovima" note={`${name}, mjesečni prosjek po periodu.${c.print ? '' : ' Izaberite do 8 timova.'}`}>
          <div className="chips">
            {d.stats.map((s) => {
              const k = ds.teams[s.team].key
              return <button key={k} className={'chip' + (sel.includes(k) ? ' on' : '')} disabled={!sel.includes(k) && sel.length >= 8} onClick={() => togglePick(k)}>{label(s.team)}</button>
            })}
          </div>
          <Chart option={trend} height={chartH(c, 340, 250)} />
        </Card>
        {!c.print && table}
      </div>
    </>
  )
}
