import { createRoot } from 'react-dom/client'
import './theme'
import App from './App'
import './styles.css'

const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36)
const beat = () => { fetch('/api/heartbeat', { method: 'POST', body: clientId, keepalive: true }).catch(() => {}) }
beat()
setInterval(beat, 20000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat() })
window.addEventListener('pagehide', () => { navigator.sendBeacon('/api/bye', clientId) })
window.addEventListener('pageshow', (e) => { if (e.persisted) beat() })

createRoot(document.getElementById('root')!).render(<App />)
