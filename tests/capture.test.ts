import { describe, expect, it } from 'vitest'
import { decodeCapture, encodeCapture, parseCapture } from '../src/domain/capture.ts'
import { COLUMN_TYPES, generateCustom, validateCustom } from '../src/domain/custom.ts'
import '../extension/infer.js'

type Meta = Record<string, unknown>
const T = (globalThis as unknown as { TokiCapture: {
  CATALOG: string[]
  inferGenerator: (meta: Meta) => { type: string; confidence: number; hint: string }
  ignoreReason: (meta: Meta) => string | null
  buildPayload: (input: { captureId: string; formName: string; fields: Meta[] }) => unknown
  encodePayload: (payload: unknown) => string
} }).TokiCapture

const field = (meta: Meta) => ({ type: 'text', controlType: 'text', ...meta })

describe('captura inteligente · extensão', () => {
  it('usa só tipos que existem na Massa Personalizada', () => {
    expect([...T.CATALOG].sort()).toEqual([...COLUMN_TYPES].sort())
  })

  it('sugere geradores por atributo, label e tipo (CT-06)', () => {
    expect(T.inferGenerator(field({ label: 'CNPJ', name: 'doc' })).type).toBe('CNPJ')
    expect(T.inferGenerator(field({ name: 'cpfCliente' })).type).toBe('CPF')
    expect(T.inferGenerator(field({ type: 'email', label: 'E-mail' }))).toMatchObject({ type: 'E-mail', confidence: 0.95 })
    expect(T.inferGenerator(field({ label: 'Sobrenome' })).type).toBe('Sobrenome')
    expect(T.inferGenerator(field({ autocomplete: 'shipping postal-code' })).type).toBe('CEP')
    expect(T.inferGenerator(field({ label: 'Estado civil', options: ['Solteiro', 'Casado'] })).type).toBe('Lista de opções')
    expect(T.inferGenerator(field({ label: 'Estado civil' })).type).not.toBe('UF')
    expect(T.inferGenerator(field({ type: 'number', step: '0.01', label: 'Peso líquido' })).type).toBe('Decimal')
  })

  it('marca o desconhecido como incerto e editável (CT-07)', () => {
    const guess = T.inferGenerator(field({ label: 'Xyz' }))
    expect(guess.type).toBe('Texto curto')
    expect(guess.confidence).toBeLessThan(0.6)
  })

  it('ignora campos técnicos, ocultos e desabilitados (CT-14)', () => {
    expect(T.ignoreReason({ type: 'hidden', name: 'x' })).toBe('oculto')
    expect(T.ignoreReason({ type: 'text', name: 'csrf_token' })).toBe('técnico')
    expect(T.ignoreReason({ type: 'text', name: 'nome', disabled: true })).toBe('desabilitado')
    expect(T.ignoreReason({ type: 'text', name: 'nome' })).toBeNull()
  })
})

describe('captura inteligente · importação no Toki', () => {
  const payload = T.buildPayload({
    captureId: 'abc',
    formName: 'Cadastro de organização',
    fields: [
      { name: 'cnpj', label: 'CNPJ', controlType: 'text', required: true, constraints: { maxLength: 18 }, type: 'CNPJ', confidence: 0.98, source: 'label' },
      { name: 'nome', label: 'Nome', controlType: 'text', constraints: { maxLength: 5, pattern: '[A-Z]+' }, type: 'Texto curto', confidence: 0.4, source: 'padrão' },
      { name: 'nome', label: 'Nome 2', controlType: 'text', constraints: {}, type: 'Inexistente', confidence: 0.9, source: 'label' },
      { name: 'qtd', label: 'Quantidade', controlType: 'number', constraints: { min: 3, max: 7 }, type: 'Número inteiro', confidence: 0.6, source: 'tipo' },
      { name: 'porte', label: 'Porte', controlType: 'select', constraints: {}, options: ['ME', 'EPP'], type: 'Lista de opções', confidence: 0.9, source: 'opções' },
    ],
  })

  it('ida e volta pela URL preservam acentos', () => {
    const encoded = T.encodePayload(payload)
    expect(encoded).toBe(encodeCapture(payload))
    expect(decodeCapture(encoded)).toEqual(payload)
  })

  it('converte em colunas válidas, com nomes únicos e restrições aplicáveis (CT-04, CT-11)', () => {
    const result = parseCapture(payload)
    if ('error' in result) throw new Error(result.error)
    expect(result.formName).toBe('Cadastro de organização')
    expect(result.columns.map((column) => column.name)).toEqual(['cnpj', 'nome', 'nome (2)', 'qtd', 'porte'])
    expect(result.columns[2].type).toBe('Texto curto')
    expect(result.columns[3].extra).toEqual({ min: 3, max: 7 })
    expect(result.notes.some((note) => note.column === 'nome' && note.text.includes('[A-Z]+'))).toBe(true)
    expect(result.notes.some((note) => note.column === 'cnpj' && note.text.includes('18'))).toBe(true)
    expect(validateCustom(result.columns, 50)).toBeNull()

    const rows = generateCustom({ columns: result.columns, count: 50, seed: 3, referenceDate: new Date(2026, 10, 22), consistent: true })
    for (const row of rows) {
      expect(row.values.nome.length).toBeLessThanOrEqual(5)
      expect(Number(row.values.qtd)).toBeGreaterThanOrEqual(3)
      expect(Number(row.values.qtd)).toBeLessThanOrEqual(7)
      expect(['ME', 'EPP']).toContain(row.values.porte)
    }
  })

  it('rejeita origem, versão e formato inválidos (CT-15)', () => {
    expect(parseCapture({ ...(payload as object), source: 'site-qualquer' })).toHaveProperty('error')
    expect(parseCapture({ ...(payload as object), schemaVersion: '9.9' })).toHaveProperty('error')
    expect(parseCapture({ schemaVersion: '1.0', source: 'toki-browser-extension', form: { fields: [] } })).toHaveProperty('error')
    expect(() => decodeCapture('%%%')).toThrow()
    expect(() => decodeCapture('a'.repeat(200_000))).toThrow()
  })

  it('gera inválidos rotulados para lista, texto limitado e inteiro com limite', () => {
    const columns = [
      { id: '1', name: 'porte', type: 'Lista de opções', rule: 'Inválido' as const, extra: { options: ['ME'] } },
      { id: '2', name: 'sigla', type: 'Texto curto', rule: 'Inválido' as const, extra: { maxLength: 3 } },
      { id: '3', name: 'qtd', type: 'Número inteiro', rule: 'Inválido' as const, extra: { min: 1, max: 9 } },
    ]
    const rows = generateCustom({ columns, count: 6, seed: 1, referenceDate: new Date(2026, 10, 22), consistent: false })
    for (const row of rows) {
      expect(Object.values(row.checks).every((check) => check === 'falha')).toBe(true)
      expect(row.values.porte).not.toBe('ME')
    }
    expect(validateCustom([{ ...columns[0], rule: 'Válido', extra: { options: [' '] } }], 1)).toContain('vazia')
  })
})

describe('vínculos entre campos', () => {
  const day = (text: string) => {
    const [d, m, y] = text.split('/').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const reference = new Date(2026, 10, 22)

  it('confirmação copia a coluna e data final sai depois da inicial (CT-12)', () => {
    const columns = [
      { id: 'fim', name: 'fim', type: 'Data', rule: 'Válido' as const, extra: { after: 'ini' } },
      { id: 'ini', name: 'inicio', type: 'Data', rule: 'Válido' as const },
      { id: 'senha', name: 'senha', type: 'Texto curto', rule: 'Válido' as const },
      { id: 'conf', name: 'confirmacao', type: 'Cópia de outra coluna', rule: 'Válido' as const, extra: { ref: 'senha' } },
    ]
    expect(validateCustom(columns, 30)).toBeNull()
    const rows = generateCustom({ columns, count: 30, seed: 9, referenceDate: reference, consistent: true })
    for (const row of rows) {
      expect(row.values.confirmacao).toBe(row.values.senha)
      expect(day(row.values.fim)).toBeGreaterThanOrEqual(day(row.values.inicio))
    }
  })

  it('inválidos quebram o vínculo e ficam rotulados', () => {
    const columns = [
      { id: 'ini', name: 'inicio', type: 'Data', rule: 'Válido' as const },
      { id: 'fim', name: 'fim', type: 'Data', rule: 'Inválido' as const, extra: { after: 'ini' } },
      { id: 'senha', name: 'senha', type: 'Texto curto', rule: 'Válido' as const },
      { id: 'conf', name: 'confirmacao', type: 'Cópia de outra coluna', rule: 'Inválido' as const, extra: { ref: 'senha' } },
    ]
    const rows = generateCustom({ columns, count: 10, seed: 2, referenceDate: reference, consistent: false })
    for (const row of rows) {
      expect(row.values.confirmacao).not.toBe(row.values.senha)
      expect(day(row.values.fim)).toBeLessThan(day(row.values.inicio))
      expect(row.checks.fim).toBe('falha')
    }
  })

  it('rejeita ciclo, referência perdida e vínculo de data com coluna que não é data (CT-16)', () => {
    const a = { id: 'a', name: 'a', type: 'Cópia de outra coluna', rule: 'Válido' as const, extra: { ref: 'b' } }
    const b = { id: 'b', name: 'b', type: 'Cópia de outra coluna', rule: 'Válido' as const, extra: { ref: 'a' } }
    expect(validateCustom([a, b], 1)).toMatch(/circular: a → b → a/)
    expect(validateCustom([{ ...a, extra: { ref: 'x' } }], 1)).toContain('não existe')
    expect(validateCustom([{ ...a, extra: {} }], 1)).toContain('Escolha a coluna')
    expect(validateCustom([
      { id: 'n', name: 'n', type: 'Texto curto', rule: 'Válido' },
      { id: 'd', name: 'd', type: 'Data', rule: 'Válido', extra: { after: 'n' } },
    ], 1)).toContain('coluna de data')
  })

  it('a extensão vincula confirmação e data final e o Toki resolve os ids', () => {
    const fields = [
      { key: 'f1', name: 'senha', label: 'Senha', controlType: 'password', type: 'Texto curto', confidence: 0.6, source: 'label', constraints: {} },
      { key: 'f2', name: 'senha2', label: 'Confirmar senha', controlType: 'password', type: 'Texto curto', confidence: 0.6, source: 'label', constraints: {} },
      { key: 'f3', name: 'email', label: 'E-mail', controlType: 'email', type: 'E-mail', confidence: 0.95, source: 'label', constraints: {} },
      { key: 'f4', name: 'ida', label: 'Data de ida', controlType: 'date', type: 'Data', confidence: 0.8, source: 'label', constraints: {} },
      { key: 'f5', name: 'volta', label: 'Data de volta', controlType: 'date', type: 'Data', confidence: 0.8, source: 'label', constraints: {} },
    ]
    const linked = (globalThis as unknown as { TokiCapture: { linkDependencies: (f: Meta[]) => Meta[] } }).TokiCapture.linkDependencies(fields)
    expect(linked[1]).toMatchObject({ type: 'Cópia de outra coluna', ref: 'f1' })
    expect(linked[2].type).toBe('E-mail')
    expect(linked[4]).toMatchObject({ type: 'Data', after: 'f4' })

    const result = parseCapture(T.buildPayload({ captureId: 'x', formName: 'Viagem', fields: linked }))
    if ('error' in result) throw new Error(result.error)
    const byName = Object.fromEntries(result.columns.map((column) => [column.name, column]))
    expect(byName.senha2.extra?.ref).toBe(byName.senha.id)
    expect(byName.volta.extra?.after).toBe(byName.ida.id)
    expect(validateCustom(result.columns, 5)).toBeNull()
  })

  it('a importação desfaz vínculos órfãos ou circulares sem travar', () => {
    const payload = T.buildPayload({ captureId: 'y', formName: 'X', fields: [
      { key: 'f1', name: 'a', label: 'a', controlType: 'text', type: 'Cópia de outra coluna', ref: 'f2', confidence: 1, source: 'manual', constraints: {} },
      { key: 'f2', name: 'b', label: 'b', controlType: 'text', type: 'Cópia de outra coluna', ref: 'f1', confidence: 1, source: 'manual', constraints: {} },
      { key: 'f3', name: 'c', label: 'c', controlType: 'text', type: 'Cópia de outra coluna', ref: 'sumiu', confidence: 1, source: 'manual', constraints: {} },
    ] }) as { form: { fields: { generator: Record<string, unknown> }[] } }
    expect(payload.form.fields[2].generator.ref).toBeUndefined()
    const result = parseCapture(payload)
    if ('error' in result) throw new Error(result.error)
    expect(result.columns.every((column) => column.type === 'Texto curto')).toBe(true)
    expect(result.notes.some((note) => note.text.includes('ciclo'))).toBe(true)
    expect(validateCustom(result.columns, 1)).toBeNull()
  })
})

describe('motor da extensão', () => {
  it('gera valor rotulado e pessoa coerente', async () => {
    const engine = await import('../src/extension/engine.ts')
    expect(engine.one('CPF').value).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
    expect(engine.one('CPF', 'Inválido').ok).toBe(false)
    const person = engine.person()
    expect(person.map((item) => item.type)).toEqual([...engine.PERSON])
    expect(person.every((item) => item.ok && item.value)).toBe(true)
    expect(engine.TYPES).not.toContain('Cópia de outra coluna')
  })
})

describe('números › fórmulas e gráficos', () => {
  it('gera expressão, fórmula, ponto e função coerentes', async () => {
    const { mathRun } = await import('../src/domain/math.ts')
    const { rng } = await import('../src/domain/mfEngine.ts')
    const r = rng(11)
    const valid = mathRun({ tipo: 'Expressão', complexidade: 'Com parênteses', regraExpr: 'Válida', qtd: 20 }, r)
    expect(valid.every((item) => item.fields.find((f) => f.key === 'resultado')?.v.match(/^-?[\d.]+(,\d+)?$/))).toBe(true)
    const zero = mathRun({ tipo: 'Expressão', regraExpr: 'Divisão por zero', qtd: 3 }, r)
    expect(zero.every((item) => item.tone === 'bad' && item.fields[0].v.includes('÷ ('))).toBe(true)
    const pt = mathRun({ tipo: 'Fórmula de planilha', idioma: 'Português', regraForm: 'Válida', qtd: 30 }, r)
    expect(pt.every((item) => item.fields[0].v.startsWith('=') && !/\w,\w*"/.test(item.fields[0].v))).toBe(true)
    const en = mathRun({ tipo: 'Fórmula de planilha', idioma: 'Inglês', regraForm: 'Função inexistente', qtd: 5 }, r)
    expect(en.every((item) => item.tone === 'bad' && /AR\(/.test(item.fields[0].v))).toBe(true)
    const q3 = mathRun({ tipo: 'Ponto cartesiano', quadrante: '3º quadrante', min: 1, max: 50, casas: '1', sep: 'Ponto', qtd: 40 }, r)
    expect(q3.every((item) => Number(item.fields.find((f) => f.key === 'x')!.v) < 0 && Number(item.fields.find((f) => f.key === 'y')!.v) < 0)).toBe(true)
    const line = mathRun({ tipo: 'Pontos de função', funcao: 'Linear', min: 0, max: 10, casas: '2', sep: 'Ponto', qtd: 11 }, r)
    const xy = line.map((item) => [Number(item.fields.find((f) => f.key === 'x')!.v), Number(item.fields.find((f) => f.key === 'y')!.v)])
    expect(xy.map(([x]) => x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const slope = xy[1][1] - xy[0][1]
    expect(xy.every(([x, y]) => Math.abs(y - (xy[0][1] + slope * x)) < 0.02)).toBe(true)
  })

  it('aparece no gerador de Números e esconde campos que não valem', async () => {
    const { ENG } = await import('../src/domain/mfEngine.ts')
    const engine = ENG.numero
    expect(engine.fields.find((f: { k: string }) => f.k === 'tipo').opts).toEqual(expect.arrayContaining(['Expressão', 'Fórmula de planilha', 'Ponto cartesiano', 'Pontos de função']))
    const sinal = engine.fields.find((f: { k: string }) => f.k === 'sinal')
    expect(sinal.show({ ...engine.def, tipo: 'Expressão' })).toBe(false)
    expect(sinal.show({ ...engine.def, tipo: 'Inteiro' })).toBe(true)
  })
})

describe('dados pessoais › pessoa jurídica', () => {
  const dvOk = (cnpj: string) => {
    const d = cnpj.replace(/\D/g, '')
    const calc = (base: string) => {
      const w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - base.length)
      const x = base.split('').reduce((t, c, i) => t + Number(c) * w[i], 0) % 11
      return x < 2 ? 0 : 11 - x
    }
    const a = calc(d.slice(0, 12))
    return a === Number(d[12]) && calc(d.slice(0, 12) + a) === Number(d[13])
  }

  it('gera ficha coerente com CNPJ válido ou inválido', async () => {
    const { ENG, rng } = await import('../src/domain/mfEngine.ts')
    const ok = ENG.empresa.run({ ...ENG.empresa.def, uf: 'MG', qtd: 20 }, rng(5))
    for (const item of ok) {
      const v = Object.fromEntries(item.fields.map((f: { key: string; v: string }) => [f.key, f.v]))
      expect(v.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/0001-\d{2}$/)
      expect(dvOk(v.cnpj)).toBe(true)
      expect(v.uf).toBe('MG')
      expect(v.telefone).toMatch(/^\(\d{2}\) 3\d{3}-\d{4}$/)
      expect(v.email).toMatch(/^contato@[a-z0-9]+\.com\.br$/)
      expect(v.razao_social.length).toBeGreaterThan(5)
      if (v.natureza.includes('S.A.')) expect(v.porte).toBe('Demais')
    }
    const bad = ENG.empresa.run({ ...ENG.empresa.def, regra: 'CNPJ inválido', mask: 'Sem máscara', filial: 'Filial', qtd: 10 }, rng(9))
    for (const item of bad) {
      const cnpj = item.fields.find((f: { key: string }) => f.key === 'cnpj').v
      expect(cnpj).toMatch(/^\d{14}$/)
      expect(cnpj.slice(8, 12)).not.toBe('0001')
      expect(dvOk(cnpj)).toBe(false)
      expect(item.tone).toBe('bad')
    }
  })
})

describe('casos de borda › tipo + lado', () => {
  it('monta a regra antiga a partir do tipo e do lado, e Todas as variações segue juntando tudo', async () => {
    const { ENG, rng } = await import('../src/domain/mfEngine.ts')
    const e = ENG.borda
    expect(e.fields.find((f: { k: string }) => f.k === 'tipoBorda').opts).toEqual(['Todas as variações', 'Comprimento', 'Valor', 'Nulo e vazio', 'Caracteres especiais', 'Valores extremos', 'Duplicidade'])
    const max = e.run({ ...e.def, tipoBorda: 'Comprimento', lado: 'Máximo', limite: 10 }, rng(1))
    expect(max.map((item: { fields: { v: string }[] }) => item.fields[0].v.length)).toEqual([9, 10, 11])
    const all = e.run({ ...e.def, tipoBorda: 'Todas as variações', limite: 10 }, rng(1))
    expect(all.length).toBeGreaterThan(max.length)
  })
})

describe('extensão › campos de upload', () => {
  it('reconhece upload e escolhe o arquivo de exemplo pelo accept', async () => {
    expect(T.ignoreReason({ type: 'file', name: 'anexo' })).toBeNull()
    expect(T.inferGenerator({ type: 'file', controlType: 'file', accept: 'image/*' }).hint).toMatch(/Upload \(aceita image\/\*\)/)
    const engine = await import('../src/extension/engine.ts')
    expect(engine.acceptedExtensions('image/*,.pdf')).toEqual(['PNG', 'PDF'])
    expect(engine.pickSample('', true)).toEqual({ ext: 'PDF', corrupt: false })
    expect(engine.pickSample('image/*', false)).toEqual({ ext: 'TXT', corrupt: false })
    expect(engine.pickSample('', false)).toEqual({ ext: 'PDF', corrupt: true })
    const png = await engine.sampleFile('image/png')
    expect(png.name).toMatch(/\.png$/)
    expect([...png.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const pdf = await engine.sampleFile('.pdf')
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-')
  })
})
