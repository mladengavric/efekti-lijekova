import type { Report, ReportSummary } from './data'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Greška ${res.status}`
    try { msg = (await res.json()).detail ?? msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export type ImportResult = {
  fajl: string; ok: boolean; greska?: string; zamijenjen?: boolean; izvjestaj?: ReportSummary
}

export const api = {
  reports: () => fetch('/api/reports').then((r) => j<ReportSummary[]>(r)),
  dataset: (ustanova: string) =>
    fetch('/api/dataset?ustanova=' + encodeURIComponent(ustanova)).then((r) => j<Report[]>(r)),
  remove: (id: string) => fetch('/api/reports/' + id, { method: 'DELETE' }).then((r) => j<{ ok: boolean }>(r)),
  importFiles: (files: File[]) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    return fetch('/api/import', { method: 'POST', body: fd }).then((r) => j<ImportResult[]>(r))
  },
  importFolder: () => fetch('/api/import-folder', { method: 'POST' }).then((r) => j<ImportResult[]>(r)),
  names: () => fetch('/api/nazivi').then((r) => j<NameRow[]>(r)),
  saveNames: (ispravke: Record<string, string>) => fetch('/api/nazivi', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ispravke }),
  }).then((r) => j<{ ok: boolean; izmijenjeno_izvjestaja: number }>(r)),
}

export type NameRow = { vrsta: 'ustanova' | 'tim'; sifra: string | null; pdf: string; naziv: string }

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function exportXlsx(naziv: string, kolone: string[], redovi: (string | number | null)[][]) {
  const res = await fetch('/api/export/xlsx', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ naziv, kolone, redovi }),
  })
  if (!res.ok) throw new Error('Izvoz nije uspio.')
  download(await res.blob(), naziv + '.xlsx')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function savePdf(naziv: string, node: HTMLElement) {
  const css = [...document.styleSheets].map((s) => {
    try { return [...s.cssRules].map((r) => r.cssText).join('\n') } catch { return '' }
  }).join('\n')
  const html = `<!doctype html><html lang="sr-Latn" data-theme="light"><head><meta charset="utf-8"><title>${esc(naziv)}</title>` +
    `<style>${css}</style></head><body><div class="app"><main>${node.outerHTML}</main></div></body></html>`
  const res = await fetch('/api/export/pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }),
  })
  if (!res.ok) {
    let msg = 'Snimanje PDF-a nije uspjelo.'
    try { msg = (await res.json()).detail ?? msg } catch {}
    throw new Error(msg)
  }
  download(await res.blob(), naziv.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() + '.pdf')
}

export function exportCsv(naziv: string, kolone: string[], redovi: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v == null) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  }
  const text = [kolone, ...redovi].map((r) => r.map(cell).join(';')).join('\r\n')
  download(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), naziv + '.csv')
}
