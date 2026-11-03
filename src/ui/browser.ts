export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  downloadBlob(filename, new Blob([copy], { type: mime }))
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  downloadBytes(filename, new TextEncoder().encode(text), mime)
}

export type Notice = { title: string; detail?: string; bad?: boolean }

export function downloadNotice(filename?: string): Notice {
  return {
    title: 'Download iniciado',
    detail: filename
      ? `${filename}. Confira a pasta de downloads. O navegador não avisa se o arquivo foi salvo.`
      : 'Confira a pasta de downloads. O navegador não avisa se o arquivo foi salvo.',
  }
}
