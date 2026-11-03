import { describe, expect, it } from 'vitest'
import { decodePixels } from '../src/domain/scanDecode.ts'
import { validateFinance } from '../src/domain/inspect/finance.ts'
import { ENG, rng, setReferenceDate } from '../src/domain/mfEngine.ts'
import { qrRaster } from '../src/domain/symbols.ts'

const ITF: Record<string, string> = { 0: 'nnwwn', 1: 'wnnnw', 2: 'nwnnw', 3: 'wwnnn', 4: 'nnwnw', 5: 'wnwnn', 6: 'nwwnn', 7: 'nnnww', 8: 'wnnwn', 9: 'nwnwn' }

// Desenha um código ITF (o do boleto) em pixels RGBA, como numa foto bem enquadrada.
function itfPixels(digits: string, narrow = 3, wide = 8, height = 90, quiet = 40) {
  const runs: [boolean, number][] = [[true, narrow], [false, narrow], [true, narrow], [false, narrow]]
  for (let index = 0; index < digits.length; index += 2) {
    const bars = ITF[digits[index]]
    const spaces = ITF[digits[index + 1]]
    for (let k = 0; k < 5; k += 1) runs.push([true, bars[k] === 'w' ? wide : narrow], [false, spaces[k] === 'w' ? wide : narrow])
  }
  runs.push([true, wide], [false, narrow], [true, narrow])
  const width = runs.reduce((total, [, size]) => total + size, 0) + quiet * 2
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
  let x = quiet
  for (const [dark, size] of runs) {
    if (dark) for (let y = 0; y < height; y += 1) for (let dx = 0; dx < size; dx += 1) rgba.fill(0, ((y * width) + x + dx) * 4, ((y * width) + x + dx) * 4 + 3)
    x += size
  }
  return { rgba, width, height }
}

function rotate90(rgba: Uint8ClampedArray, width: number, height: number) {
  const out = new Uint8ClampedArray(rgba.length)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out.set(rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), ((x * height) + (height - 1 - y)) * 4)
  return { rgba: out, width: height, height: width }
}

describe('leitura de código por foto', () => {
  it('lê um QR Code', () => {
    const raster = qrRaster('00020126580014br.gov.bcb.pix', 4, 'M', 6)
    expect(decodePixels(raster.data, raster.width, raster.height)).toEqual({ text: '00020126580014br.gov.bcb.pix', format: 'QR Code' })
  })

  it('lê o código de barras de um boleto gerado, deitado ou em pé, e ele valida', () => {
    setReferenceDate(new Date(2026, 10, 2, 12))
    const engine = (ENG as unknown as Record<string, { def: Record<string, unknown>; run: (config: Record<string, unknown>, random: () => number) => { fields: { key: string; v: string }[] }[] }>).boleto
    const barcode = engine.run({ ...engine.def, qtd: 1 }, rng(8))[0].fields.find((field) => field.key === 'codigo_barras')!.v.replace(/\D/g, '')
    expect(barcode).toHaveLength(44)
    const flat = itfPixels(barcode)
    expect(decodePixels(flat.rgba, flat.width, flat.height)?.text).toBe(barcode)
    const standing = rotate90(flat.rgba, flat.width, flat.height)
    expect(decodePixels(standing.rgba, standing.width, standing.height)?.text).toBe(barcode)
    expect(validateFinance(barcode, 'Detectar', new Date(2026, 10, 2, 12)).verdicts[0].tone).not.toBe('bad')
  })

  it('devolve nulo quando não há código', () => {
    expect(decodePixels(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40)).toBeNull()
  })
})
