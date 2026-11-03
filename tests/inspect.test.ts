import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { generateFiles } from '../src/domain/files.ts'
import { validateCoords } from '../src/domain/inspect/coords.ts'
import { profileDataset } from '../src/domain/inspect/dataset.ts'
import { validateDates } from '../src/domain/inspect/dates.ts'
import { inspectFile } from '../src/domain/inspect/files.ts'
import { validateFinance } from '../src/domain/inspect/finance.ts'
import { validateNumbers } from '../src/domain/inspect/numbers.ts'
import { validatePeople } from '../src/domain/inspect/people.ts'
import { validateStructured } from '../src/domain/inspect/structured.ts'
import { validateEdges, validateText } from '../src/domain/inspect/text.ts'
import { ENG, FILE_DEF, cpfD, rng, setReferenceDate } from '../src/domain/mfEngine.ts'
import { VALIDATORS } from '../src/ui/validators.ts'

const DAY = new Date(2026, 10, 2, 12)
const tones = (outcome: { verdicts: { tone: string }[] }) => outcome.verdicts.map((item) => item.tone)
const label = (outcome: { verdicts: { checks: { label: string; tone: string }[] }[] }, index: number, name: string) => outcome.verdicts[index].checks.find((check) => check.label === name)?.tone

async function file(sel: string, extra: Record<string, unknown> = {}) {
  return (await generateFiles({ ...FILE_DEF, sel: [sel], qtd: 1, tam: 2, unid: 'KB', ...extra } as never, 9))[0].bytes
}

describe('investigador de arquivos', () => {
  it('aprova arquivos reais gerados pelo app', async () => {
    for (const [name, sel] of [['a.pdf', 'PDF'], ['a.png', 'PNG'], ['a.jpg', 'JPG'], ['a.gif', 'GIF'], ['a.docx', 'DOCX'], ['a.xlsx', 'XLSX'], ['a.odt', 'ODT'], ['a.wav', 'WAV'], ['a.zip', 'ZIP']]) {
      const verdict = await inspectFile({ name, bytes: await file(sel) })
      expect([name, verdict.tone]).toEqual([name, 'ok'])
    }
  })

  it('acusa corrompido, truncado e extensão trocada', async () => {
    expect((await inspectFile({ name: 'x.pdf', bytes: await file('PDF', { conteudo: 'Corrompido' }) })).tone).toBe('bad')
    const truncated = await inspectFile({ name: 'x.png', bytes: await file('PNG', { conteudo: 'Truncado' }) })
    expect(truncated.checks.find((check) => check.label === 'Estrutura')?.detail).toMatch(/truncada/)
    const swapped = await inspectFile({ name: 'x.pdf', bytes: await file('PNG') })
    expect(swapped.checks.find((check) => check.label === 'Extensão')?.detail).toMatch(/conteúdo é PNG/)
  })

  it('acha macro VBA, dupla extensão e zip slip', async () => {
    const zip = await JSZip.loadAsync(await file('DOCX'))
    zip.file('word/vbaProject.bin', new Uint8Array([1, 2, 3]))
    const macro = await zip.generateAsync({ type: 'uint8array' })
    expect((await inspectFile({ name: 'proposta.docx', bytes: macro })).checks.find((check) => check.label === 'Macro')?.tone).toBe('bad')
    expect((await inspectFile({ name: 'proposta.docm', bytes: macro })).checks.find((check) => check.label === 'Macro')?.tone).toBe('warn')
    expect((await inspectFile({ name: 'fatura.pdf.exe', bytes: await file('PDF') })).checks.find((check) => check.label === 'Nome')?.tone).toBe('bad')
    const slip = new JSZip()
    slip.file('../../etc/passwd', 'x')
    const verdict = await inspectFile({ name: 'pacote.zip', bytes: await slip.generateAsync({ type: 'uint8array' }) })
    expect(verdict.checks.find((check) => check.label === 'Caminho')?.tone).toBe('bad')
  })

  it('reconhece executável disfarçado e SVG com script', async () => {
    const pe = new Uint8Array(512)
    pe.set([0x4d, 0x5a])
    pe.set([0x80], 0x3c)
    pe.set([0x50, 0x45, 0, 0, 0x64, 0x86], 0x80)
    const disguised = await inspectFile({ name: 'foto.jpg', bytes: pe })
    expect(disguised.checks.find((check) => check.label === 'Tipo real')?.detail).toMatch(/Executável/)
    expect(disguised.tone).toBe('bad')
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect((await inspectFile({ name: 'logo.svg', bytes: svg })).checks.find((check) => check.label === 'Conteúdo ativo')?.tone).toBe('bad')
  })
})

describe('validadores por categoria', () => {
  it('dados pessoais', () => {
    const cpf = cpfD(rng(3), 'SP').join('')
    const wrong = cpf.slice(0, 10) + ((Number(cpf[10]) + 1) % 10)
    const result = validatePeople([cpf, wrong, '11.222.333/0001-81', '12.ABC.345/01DE-35', 'ana@exemplo.com.br', 'ana@@x', '(11) 98765-4321', '(20) 8765-4321', '01310-100', '29/02/2023'].join('\n'), 'Detectar', DAY)
    expect(tones(result)).toEqual(['ok', 'bad', 'ok', 'ok', 'ok', 'bad', 'ok', 'bad', 'warn', 'bad'])
  })

  it('financeiro: cartão, PIX e boleto do próprio gerador passam; alterados falham', () => {
    setReferenceDate(DAY)
    const run = (id: string, config: Record<string, unknown>, key: string) => {
      const engine = (ENG as unknown as Record<string, { def: Record<string, unknown>; run: (config: Record<string, unknown>, random: () => number) => { fields: { key: string; v: string }[] }[] }>)[id]
      return engine.run({ ...engine.def, ...config }, rng(5)).map((item) => item.fields.find((field) => field.key === key)?.v ?? '')
    }
    const [card] = run('cartao', { qtd: 1 }, 'numero_cartao')
    const [pix] = run('pix', { qtd: 1, payload: true }, 'payload')
    const [line] = run('boleto', { qtd: 1 }, 'linha')
    const ok = validateFinance([card, pix, line].join('\n'), 'Detectar', DAY)
    expect(ok.verdicts.map((item) => item.tone).every((tone) => tone !== 'bad')).toBe(true)
    const brokenPix = pix.slice(0, -1) + (pix.endsWith('0') ? '1' : '0')
    const brokenLine = line.replace(/\d/, (digit) => String((Number(digit) + 1) % 10))
    expect(tones(validateFinance(['4111 1111 1111 1112', brokenPix, brokenLine].join('\n'), 'Detectar', DAY))).toEqual(['bad', 'bad', 'bad'])
  })

  it('datas', () => {
    expect(tones(validateDates(['29/02/2024', '29/02/2023', '2026-11-02T14:30:00-03:00', '2026-11-02T14:30:00+15:00', '25:61'].join('\n'), { formato: 'Detectar', min: '', max: '', day: DAY }))).toEqual(['ok', 'bad', 'ok', 'bad', 'bad'])
  })

  it('números', () => {
    expect(tones(validateNumbers(['42', '100,01', '1.234,56', 'doze', '#5E7F55'].join('\n'), { estilo: 'Detectar', min: '0', max: '100', casas: '2', inteiro: false }))).toEqual(['ok', 'bad', 'bad', 'bad', 'ok'])
  })

  it('coordenadas: acha a inversão e a área com limites trocados', () => {
    const result = validateCoords(['-23.5505, -46.6333', '-46.6333, -23.5505', '91, 10', '-23.8, -46.9 → -23.3, -46.3', '-23.3, -46.3 → -23.8, -46.9'].join('\n'), { regiao: 'Brasil', latMin: 0, latMax: 0, lngMin: 0, lngMax: 0 })
    expect(tones(result)).toEqual(['ok', 'bad', 'bad', 'ok', 'bad'])
    expect(result.verdicts[1].checks.find((check) => check.label === 'Região')?.detail).toMatch(/invertidas/)
  })

  it('estruturados: aponta a linha do erro', () => {
    expect(tones(validateStructured('{"a": 1}', 'Detectar'))).toEqual(['ok'])
    const json = validateStructured('{\n  "a": 1,\n}', 'Detectar')
    expect(json.verdicts[0].tone).toBe('bad')
    const xml = validateStructured('<a><b></a>', 'XML')
    expect(xml.verdicts[0].checks.at(-1)?.detail).toMatch(/fecha <b>/)
    expect(tones(validateStructured('id,nome\n1,Ana\n2', 'CSV'))).toEqual(['bad'])
    expect(tones(validateStructured('7891234567895', 'Código de barras'))).toEqual(['ok'])
  })

  it('textos e casos de borda', () => {
    const zeroWidth = String.fromCharCode(0x200b)
    expect(label(validateText(`abc${zeroWidth}def`, { unidade: 'Caracteres', min: '', max: '' }), 0, 'Invisíveis')).toBe('bad')
    expect(label(validateText('Paypal Раypal', { unidade: 'Caracteres', min: '', max: '' }), 0, 'Homóglifos')).toBe('bad')
    expect(label(validateText('a'.repeat(256), { unidade: 'Caracteres', min: '', max: '255' }), 0, 'Limite')).toBe('bad')
    expect(label(validateText('ção', { unidade: 'Bytes UTF-8', min: '', max: '5' }), 0, 'Limite')).toBe('warn')
    const edges = validateEdges(['1234567890', '12345678901', '', 'abc', 'ABC'].join('\n'), { unidade: 'Caracteres', min: '1', max: '10', valorMin: '', valorMax: '', obrigatorio: true, unico: true })
    expect(tones(edges)).toEqual(['warn', 'bad', 'bad', 'ok', 'bad'])
  })

  it('perfil de massa', () => {
    const cpf = cpfD(rng(2), 'SP').join('')
    const result = profileDataset(['id,cpf,email', `1,${cpf},a@x.com`, `1,123.456.789-00,b@x`].join('\n'))
    const byColumn = Object.fromEntries(result.verdicts.map((item) => [item.input, item.tone]))
    expect(byColumn).toMatchObject({ id: 'bad', cpf: 'bad', email: 'bad' })
  })

  it('cada categoria tem validador e os exemplos rodam sem erro', async () => {
    for (const [id, spec] of Object.entries(VALIDATORS)) {
      const sample = await spec.examples({ ...spec.defaults }, DAY)
      const outcome = await spec.run({ text: sample.text ?? '', files: sample.files ?? [] }, { ...spec.defaults }, DAY)
      expect([id, outcome.error ?? '']).toEqual([id, ''])
      expect(outcome.verdicts.length).toBeGreaterThan(0)
      if (id !== 'textos') expect([id, outcome.verdicts.some((item) => item.tone === 'bad')]).toEqual([id, true])
    }
  }, 120000)
})
