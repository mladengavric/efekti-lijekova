import { useSyncExternalStore } from 'react'

export type Mode = 'light' | 'dark'

const mq = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
let chosen: Mode | null = null
try {
  const v = localStorage.getItem('tema')
  if (v === 'light' || v === 'dark') chosen = v
} catch {}

export const currentMode = (): Mode => chosen ?? (mq.matches ? 'dark' : 'light')

function apply() {
  document.documentElement.dataset.theme = currentMode()
  listeners.forEach((l) => l())
}
mq.addEventListener('change', apply)
apply()

export function setMode(m: Mode) {
  chosen = m
  try { localStorage.setItem('tema', m) } catch {}
  apply()
}
export function useMode(): Mode {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, currentMode)
}
