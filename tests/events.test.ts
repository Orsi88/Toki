import JSZip from 'jszip'
import jsQR from 'jsqr'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { EVENT_RULES, eventBatch, eventRows, eventsPdf, money, qrImagesZip, validateEvents, type EventConfig, type EventKind } from '../src/domain/events.ts'
import { rng, setReferenceDate } from '../src/domain/mfEngine.ts'

const DAY = new Date(2026, 10, 2, 12)
const BASE = { evento: 'FEST-2026', nomeEvento: 'Festival', area: 'Backstage', idadeMin: 18 }

function context(tipo: EventKind) {
  return { tipo, evento: BASE.evento, data: DAY, area: BASE.area, idadeMin: BASE.idadeMin }
}

function generate(tipo: EventKind, regra: string, seed = 7) {
  setReferenceDate(DAY)
  return eventRows({ ...BASE, tipo, regra } as EventConfig, rng(seed))
}

const qrOf = (fields: [string, string, string][]) => fields.find(([, name]) => name === 'qr')?.[2] ?? ''

describe('eventos: gerar e validar concordam', () => {
  for (const tipo of ['Ingresso', 'Credencial', 'Cupom'] as EventKind[]) {
    for (const regra of EVENT_RULES[tipo]) {
      it(`${tipo} · ${regra}`, () => {
        for (const seed of [1, 2, 3]) {
          const [row] = generate(tipo, regra, seed)
          const { verdicts } = validateEvents(qrOf(row.fields), context(tipo))
          expect(verdicts[0].tone).toBe(row.tone)
        }
      })
    }
  }

  for (const regra of EVENT_RULES['Inscrição']) {
    it(`Inscrição · ${regra}`, () => {
      const rows = generate('Inscrição', regra)
      const records = rows.map((row) => Object.fromEntries(row.fields.map(([, name, value]) => [name, value])))
      const { verdicts } = validateEvents(JSON.stringify(records), context('Inscrição'))
      expect(verdicts.map((item) => item.tone)).toEqual(rows.map((row) => row.tone))
    })
  }
})

describe('eventos: conferências pontuais', () => {
  it('acusa reentrada quando o mesmo ingresso passa duas vezes', () => {
    const qr = qrOf(generate('Ingresso', 'Válido')[0].fields)
    const { verdicts } = validateEvents(`${qr}\n${qr}`, context('Ingresso'))
    expect(verdicts[0].tone).not.toBe('bad')
    expect(verdicts[1].tone).toBe('bad')
    expect(verdicts[1].checks.some((check) => check.label === 'Reentrada')).toBe(true)
  })

  it('confere o dígito do cupom digitado sem o QR', () => {
    const [valid] = generate('Cupom', 'Válido')
    const [wrong] = generate('Cupom', 'Dígito inválido')
    const code = (row: typeof valid) => row.fields.find(([, name]) => name === 'cupom')?.[2] ?? ''
    expect(validateEvents(code(valid), context('Cupom')).verdicts[0].tone).toBe('warn')
    expect(validateEvents(code(wrong), context('Cupom')).verdicts[0].tone).toBe('bad')
  })

  it('pula a conferência do evento quando ele não é informado', () => {
    const qr = qrOf(generate('Ingresso', 'Outro evento')[0].fields)
    const { verdicts } = validateEvents(qr, { ...context('Ingresso'), evento: '' })
    expect(verdicts[0].checks.find((check) => check.label === 'Evento')?.tone).toBe('warn')
  })

  it('recusa JSON inválido de inscrição com mensagem', () => {
    expect(validateEvents('{nome:', context('Inscrição')).error).toMatch(/JSON inválido/)
  })

  it('reveza as regras no lote e respeita setores e preços informados', () => {
    setReferenceDate(DAY)
    const rows = eventBatch({ ...BASE, tipo: 'Ingresso', setores: [{ nome: 'Pista Premium', preco: 300 }], tiposIngresso: ['Inteira'] }, ['Válido', 'Cancelado'], 6, rng(4))
    expect(rows.map((row) => row.rule)).toEqual(['valido', 'cancelado', 'valido', 'cancelado', 'valido', 'cancelado'])
    expect(new Set(rows.map((row) => row.fields.find(([, key]) => key === 'preco')?.[2]))).toEqual(new Set([money(300)]))
    const { verdicts } = validateEvents(rows.map((row) => qrOf(row.fields)).join('\n'), context('Ingresso'))
    expect(verdicts.map((item) => item.tone)).toEqual(['ok', 'bad', 'ok', 'bad', 'ok', 'bad'])
  })

  it('monta um PDF com uma página por item', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const rows = [...generate('Ingresso', 'Válido', 1), ...generate('Ingresso', 'Válido', 2)]
    expect((await PDFDocument.load(await eventsPdf(rows, 'Ingresso'))).getPageCount()).toBe(2)
  })
})

describe('eventos: QR em imagem', () => {
  it('o PNG do lote volta ao mesmo texto pelo leitor de QR', async () => {
    const qr = qrOf(generate('Ingresso', 'Válido')[0].fields)
    const zip = await JSZip.loadAsync(await (await qrImagesZip([{ name: 'TKT-1', qr }])).arrayBuffer())
    const png = await zip.file('TKT-1.png')!.async('uint8array')
    const view = new DataView(png.buffer, png.byteOffset)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    const chunks: Uint8Array[] = []
    for (let offset = 8; offset < png.length;) {
      const size = view.getUint32(offset)
      const type = String.fromCharCode(...png.slice(offset + 4, offset + 8))
      if (type === 'IDAT') chunks.push(png.slice(offset + 8, offset + 8 + size))
      offset += size + 12
    }
    const raw = inflateSync(Buffer.concat(chunks))
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      raw.copy(Buffer.from(pixels.buffer), y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1))
    }
    expect(jsQR(pixels, width, height)?.data).toBe(qr)
  })
})
