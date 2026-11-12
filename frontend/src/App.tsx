import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { ReportSummary } from './data'
import { setMode, useMode } from './theme'
import ImportPage from './pages/ImportPage'
import AnalysisPage from './pages/AnalysisPage'

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONS = {
  import: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 17v-6 M9.5 13.5 12 11l2.5 2.5',
  analiza: 'M4 20V10 M10 20V4 M16 20v-7 M21 20H3',
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  collapse: 'M4 5h16v14H4z M9 5v14 M16 10l-2 2 2 2',
  expand: 'M4 5h16v14H4z M9 5v14 M14 10l2 2-2 2',
}

export default function App() {
  const [page, setPage] = useState<'import' | 'analiza'>(() => (location.hash === '#import' ? 'import' : 'analiza'))
  const [reports, setReports] = useState<ReportSummary[] | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const mode = useMode()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar') === '1' } catch { return false }
  })
  const toggleSidebar = () => {
    const v = !collapsed
    setCollapsed(v)
    try { localStorage.setItem('sidebar', v ? '1' : '0') } catch {}
  }

  const reload = useCallback(() => {
    api.reports()
      .then((r) => { setReports(r); setError(''); setVersion((v) => v + 1) })
      .catch(() => setError('Aplikacija nije pokrenuta. Pokrenite start.bat, pa osvježite ovu stranu.'))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => { if (reports && reports.length === 0) setPage('import') }, [reports])

  const nav = (key: 'import' | 'analiza', label: string, icon: string) => (
    <button className={'side-btn' + (page === key ? ' on' : '')} onClick={() => setPage(key)}
      title={collapsed ? label : undefined} aria-current={page === key ? 'page' : undefined}>
      <Icon d={icon} /><span className="side-label">{label}</span>
    </button>
  )
  const themeLabel = mode === 'dark' ? 'Svijetla tema' : 'Tamna tema'

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <aside className="sidebar">
        <div className="side-head">
          <h1>Efekti lijekova</h1>
          <button className="side-btn icon" onClick={toggleSidebar} aria-expanded={!collapsed}
            title={collapsed ? 'Proširi meni' : 'Skupi meni'} aria-label={collapsed ? 'Proširi meni' : 'Skupi meni'}>
            <Icon d={collapsed ? ICONS.expand : ICONS.collapse} />
          </button>
        </div>
        <nav>
          {nav('import', 'Import FZO PDF-a', ICONS.import)}
          {nav('analiza', 'Analiza', ICONS.analiza)}
        </nav>
        <div className="side-foot">
          <button className="side-btn" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            title={collapsed ? themeLabel : undefined} aria-label={themeLabel}>
            <Icon d={mode === 'dark' ? ICONS.sun : ICONS.moon} /><span className="side-label">{themeLabel}</span>
          </button>
          <div className="side-note">{reports ? `${reports.length} izvještaja u bazi` : ''}</div>
        </div>
      </aside>
      <main>
        {error && <div className="error">{error}</div>}
        {reports && page === 'import' && <ImportPage reports={reports} reload={reload} />}
        {reports && page === 'analiza' && (
          reports.length
            ? <AnalysisPage reports={reports} version={version} />
            : (
              <div className="emptystate">
                <h2>Još nema podataka</h2>
                <p>Uvezite FZO RS izvještaje u PDF formatu da bi analiza bila dostupna.</p>
                <p style={{ marginTop: 14 }}><button className="btn primary" onClick={() => setPage('import')}>Import FZO PDF-a</button></p>
              </div>
            )
        )}
      </main>
    </div>
  )
}
