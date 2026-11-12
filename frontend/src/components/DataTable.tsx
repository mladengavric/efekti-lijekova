import { useEffect, useMemo, useState } from 'react'
import { exportCsv, exportXlsx } from '../api'
import { fmtKM } from '../data'

export type Col<T> = {
  title: string
  value: (r: T) => string | number | null
  render?: (r: T) => React.ReactNode
  fmt?: (n: number) => string
  num?: boolean
  minWidth?: number
}

export function DataTable<T>({ columns, rows, pageSize = 20, search, exportName, onRowClick, sort, empty }: {
  columns: Col<T>[]; rows: T[]; pageSize?: number
  search?: (r: T) => string
  exportName?: string
  onRowClick?: (r: T) => void
  sort?: { col: number; desc: boolean }
  empty?: string
}) {
  const [s, setS] = useState(sort ?? null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [rows, q, s])

  const view = useMemo(() => {
    let out = rows
    const needle = q.trim().toLowerCase()
    if (search && needle) out = out.filter((r) => search(r).toLowerCase().includes(needle))
    if (s) {
      const get = columns[s.col].value
      out = [...out].sort((a, b) => {
        const x = get(a), y = get(b)
        if (x == null) return 1
        if (y == null) return -1
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'sr-Latn', { numeric: true })
        return s.desc ? -c : c
      })
    }
    return out
  }, [rows, q, s, columns, search])

  const pages = Math.max(1, Math.ceil(view.length / pageSize))
  const slice = view.slice(page * pageSize, (page + 1) * pageSize)
  const data = () => view.map((r) => columns.map((c) => c.value(r)))
  const titles = columns.map((c) => c.title)

  return (
    <div className="dt">
      {(search || exportName) && (
        <div className="dt-bar">
          {search && <input type="search" placeholder="Pretraga…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pretraga" />}
          <span className="dt-count">{view.length.toLocaleString('de-DE')} redova</span>
          {exportName && (
            <>
              <button className="btn small" onClick={() => exportXlsx(exportName, titles, data()).catch((e) => alert(e.message))}>Excel</button>
              <button className="btn small" onClick={() => exportCsv(exportName, titles, data())}>CSV</button>
            </>
          )}
        </div>
      )}
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={c.num ? 'num' : ''} style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                  aria-sort={s?.col === i ? (s.desc ? 'descending' : 'ascending') : undefined}>
                  <button onClick={() => setS(s?.col === i ? { col: i, desc: !s.desc } : { col: i, desc: !!c.num })}>
                    {c.title}{s?.col === i ? (s.desc ? ' ▼' : ' ▲') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, ri) => (
              <tr key={ri} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c, i) => {
                  const v = c.value(r)
                  return (
                    <td key={i} className={c.num ? 'num' : ''}>
                      {c.render ? c.render(r) : v == null ? '–' : typeof v === 'number' ? (c.fmt ?? fmtKM)(v) : v}
                    </td>
                  )
                })}
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={columns.length} className="empty">{empty ?? 'Nema podataka.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <div className="rep-only note">Prikazano prvih {slice.length} od {view.length.toLocaleString('de-DE')} redova; cijela tabela je dostupna kroz izvoz u Excel.</div>}
      {pages > 1 && (
        <div className="dt-pages">
          <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prethodna</button>
          <span>Strana {page + 1} od {pages}</span>
          <button className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Sljedeća ›</button>
        </div>
      )}
    </div>
  )
}
