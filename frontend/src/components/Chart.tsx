import { Children, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useMode } from '../theme'

export type Theme = {
  dark: boolean; surface: string; text: string; text2: string; muted: string
  grid: string; axis: string; series: string[]; seq: string[]; neutral: string
  good: string; critical: string
}
export const LIGHT: Theme = {
  dark: false, surface: '#fcfcfb', text: '#0b0b0b', text2: '#52514e', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#104281'], neutral: '#f0efec',
  good: '#006300', critical: '#d03b3b',
}
const DARK: Theme = {
  dark: true, surface: '#1a1a19', text: '#f0efec', text2: '#c3c2b7', muted: '#898781',
  grid: '#2c2c2a', axis: '#383835',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  seq: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'], neutral: '#383835',
  good: '#0ca30c', critical: '#e66767',
}

export function useTheme(): Theme {
  return useMode() === 'dark' ? DARK : LIGHT
}

export const tip = (t: Theme, extra: object = {}) => ({
  trigger: 'axis' as const,
  axisPointer: { type: 'shadow' as const, shadowStyle: { color: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(11,11,11,0.04)' } },
  backgroundColor: t.surface, borderColor: t.grid, textStyle: { color: t.text, fontSize: 12 }, confine: true,
  ...extra,
})

export function base(t: Theme, o: echarts.EChartsOption): echarts.EChartsOption {
  return {
    color: t.series,
    animationDuration: 250,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: t.text2 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: tip(t),
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.text2 } },
    ...o,
  }
}
export const catAxis = (t: Theme, data: string[], extra: object = {}) => ({
  type: 'category' as const, data,
  axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 }, ...extra,
})
export const valAxis = (t: Theme, fmt: (n: number) => string, extra: object = {}) => ({
  type: 'value' as const,
  axisLine: { show: false }, axisTick: { show: false },
  splitLine: { lineStyle: { color: t.grid } },
  axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: (v: number) => fmt(v) }, ...extra,
})

export function Chart({ option, height = 300, onClick }: {
  option: echarts.EChartsOption; height?: number; onClick?: (p: any) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts>()
  const click = useRef(onClick)
  click.current = onClick
  useEffect(() => {
    const c = echarts.init(ref.current!, undefined, { renderer: 'svg' })
    inst.current = c
    c.on('click', (p) => click.current?.(p))
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current!)
    return () => { ro.disconnect(); c.dispose() }
  }, [])
  useEffect(() => { inst.current?.setOption(option, true) }, [option])
  return <div ref={ref} style={{ height, width: '100%' }} />
}

export function Card({ title, note, children, actions }: {
  title: string; note?: string; children: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {note && <p className="note">{note}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  const n = Children.toArray(children).length
  return <div className="kpis" style={{ ['--n' as any]: n, ['--pn' as any]: n <= 5 ? n : Math.ceil(n / 2) }}>{children}</div>
}

export function Kpi({ label, value, sub, delta, accent }: {
  label: string; value: string; sub?: string; delta?: number | null; accent?: boolean
}) {
  return (
    <div className={'kpi' + (accent ? ' accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {(sub || delta != null) && (
        <div className="kpi-sub">
          {delta != null && isFinite(delta) && (
            <span className="delta">{delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta).toFixed(1).replace('.', ',')} %</span>
          )}
          {sub}
        </div>
      )}
    </div>
  )
}
