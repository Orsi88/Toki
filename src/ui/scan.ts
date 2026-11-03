import { decodePixels, type Decoded } from '../domain/scanDecode.ts'

export type ScanMessage = { session: string; kind: 'hello' | 'code'; value?: string; format?: string }

// O repasse do celular para o computador usa a conexão do servidor de desenvolvimento.
export const relayAvailable = Boolean(import.meta.hot)

export function sendScan(message: ScanMessage) {
  import.meta.hot?.send('mf:scan', message)
}

export function listenScan(session: string, handler: (message: ScanMessage) => void) {
  const hot = import.meta.hot
  if (!hot) return () => {}
  const listener = (message: ScanMessage) => {
    if (message?.session === session) handler(message)
  }
  hot.on('mf:scan', listener)
  return () => hot.off('mf:scan', listener)
}

export async function lanAddresses(): Promise<{ ips: string[]; port: number }> {
  try {
    const response = await fetch('/__mf/lan')
    if (!response.ok) throw new Error('sem endpoint')
    return await response.json()
  } catch {
    return { ips: [], port: Number(window.location.port) || 80 }
  }
}

// Foto grande é reduzida antes da leitura: acelera e não piora o reconhecimento.
const MAX_SIDE = 1800

export async function readCode(file: File): Promise<Decoded | null> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return decodePixels(context.getImageData(0, 0, width, height).data, width, height)
}
