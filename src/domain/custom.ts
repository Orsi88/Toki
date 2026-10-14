import { cpfD, ctVal, fmtCpf, int, person, rng, setReferenceDate } from './mfEngine.ts'
import { colorCell, descriptionValue, isMeasure, measureCell, skuValue, unitsFor } from './values.ts'

export const COLUMN_TYPES = [
  'Nome completo', 'Nome', 'Sobrenome', 'CPF', 'CNPJ', 'E-mail', 'Telefone', 'CEP', 'Endereço',
  'Cidade', 'UF', 'Data de nascimento', 'Idade', 'Data', 'Data e hora', 'Número inteiro', 'Decimal',
  'Valor monetário', 'Porcentagem', 'Cor', 'Comprimento', 'Massa', 'Volume', 'Coordenada', 'Booleano', 'Status',
  'Texto curto', 'Descrição', 'Código (AAA-9999)', 'SKU', 'Cartão', 'Chave PIX', 'Conta bancária', 'UUID',
] as const

export type ColumnRule = 'Válido' | 'Inválido' | 'Misto'
export type ColumnExtra = {
  skuLen?: number
  descSize?: string
  unit?: string
  min?: number
  max?: number
  colorFormat?: string
  alpha?: number
}
export type CustomColumn = { id: string; name: string; type: string; rule: ColumnRule; extra?: ColumnExtra }
export type CustomRow = { values: Record<string, string>; checks: Record<string, 'passa' | 'falha'> }

const MAX_ROWS = 10000

export function validateCustom(columns: CustomColumn[], count: number) {
  if (columns.length === 0) return 'Inclua ao menos uma coluna.'
  if (!Number.isInteger(count) || count < 1 || count > MAX_ROWS) {
    return `A quantidade precisa ser um inteiro de 1 a ${MAX_ROWS}.`
  }
  const seen = new Set<string>()
  for (const column of columns) {
    const name = column.name.trim()
    if (!name) return 'Toda coluna precisa de um nome.'
    if (!column.type) return `A coluna "${name}" está sem tipo.`
    const folded = name.toLocaleLowerCase('pt-BR')
    if (seen.has(folded)) return `O nome "${name}" está repetido. JSON não pode perder uma coluna por sobrescrita.`
    seen.add(folded)
    const extraError = extraErrorFor(column, name)
    if (extraError) return extraError
  }
  return null
}

function extraErrorFor(column: CustomColumn, name: string) {
  if (column.type === 'SKU') {
    const length = column.extra?.skuLen ?? 8
    if (!Number.isInteger(length) || length < 1 || length > 32) {
      return `O comprimento do SKU em "${name}" precisa ser um inteiro de 1 a 32.`
    }
  }
  if (column.type === 'Descrição') {
    const size = column.extra?.descSize ?? 'Média'
    if (!['Curta', 'Média', 'Extensa'].includes(size)) return `O tamanho da descrição em "${name}" é desconhecido.`
  }
  if (column.type === 'Cor' && column.extra?.colorFormat === 'RGBA') {
    const alpha = column.extra.alpha ?? 100
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 100) return `O alfa de "${name}" precisa estar entre 0 e 100.`
  }
  if (isMeasure(column.type)) {
    const min = column.extra?.min
    const max = column.extra?.max
    if (min !== undefined && !Number.isFinite(min)) return `O mínimo de "${name}" precisa ser um número.`
    if (max !== undefined && !Number.isFinite(max)) return `O máximo de "${name}" precisa ser um número.`
    if (min !== undefined && max !== undefined && min > max) return `O mínimo de "${name}" está acima do máximo.`
    const unit = column.extra?.unit
    if (unit && !unitsFor(column.type).includes(unit)) return `A unidade de "${name}" não combina com ${column.type.toLowerCase()}.`
  }
  return null
}

export function defaultExtra(type: string): ColumnExtra | undefined {
  if (type === 'SKU') return { skuLen: 8 }
  if (type === 'Descrição') return { descSize: 'Média' }
  if (type === 'Massa') return { unit: 'g', min: 50, max: 2000 }
  if (type === 'Comprimento') return { unit: 'cm', min: 1, max: 100 }
  if (type === 'Volume') return { unit: 'ml', min: 1, max: 1000 }
  if (type === 'Cor') return { colorFormat: 'HEX', alpha: 100 }
  return undefined
}

export function productColumns(): CustomColumn[] {
  const spec: Omit<CustomColumn, 'id'>[] = [
    { name: 'sku', type: 'SKU', rule: 'Válido', extra: { skuLen: 8 } },
    { name: 'nome', type: 'Texto curto', rule: 'Válido' },
    { name: 'descricao', type: 'Descrição', rule: 'Válido', extra: { descSize: 'Média' } },
    { name: 'preco', type: 'Valor monetário', rule: 'Válido' },
    { name: 'estoque', type: 'Número inteiro', rule: 'Válido' },
    { name: 'peso', type: 'Massa', rule: 'Válido', extra: { unit: 'g', min: 50, max: 2000 } },
    { name: 'largura', type: 'Comprimento', rule: 'Válido', extra: { unit: 'cm', min: 5, max: 40 } },
    { name: 'altura', type: 'Comprimento', rule: 'Válido', extra: { unit: 'cm', min: 2, max: 30 } },
    { name: 'profundidade', type: 'Comprimento', rule: 'Válido', extra: { unit: 'cm', min: 5, max: 40 } },
  ]
  return spec.map((column, index) => ({ ...column, id: `prod-${index + 1}` }))
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function birthFor(random: () => number, today: Date) {
  const age = int(random, 18, 80)
  const date = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  date.setDate(date.getDate() - int(random, 0, 364))
  let years = today.getFullYear() - date.getFullYear()
  const anniversary = new Date(today.getFullYear(), date.getMonth(), date.getDate())
  if (today < anniversary) years -= 1
  const label = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  return { label, age: years }
}

function consistentCell(
  column: CustomColumn,
  random: () => number,
  individual: ReturnType<typeof person>,
  birth: { label: string; age: number },
  linkBirth: boolean,
) {
  if (column.rule !== 'Válido') return null
  switch (column.type) {
    case 'Nome completo':
      return individual.nome
    case 'Nome':
      return individual.first
    case 'Sobrenome':
      return individual.last
    case 'E-mail':
      return individual.email
    case 'Telefone':
      return individual.tel
    case 'CEP':
      return individual.cep
    case 'Endereço':
      return `${individual.rua}, ${individual.numero} – ${individual.bairro}`
    case 'Cidade':
      return individual.cidade
    case 'UF':
      return individual.uf
    case 'CPF':
      return fmtCpf(cpfD(random, individual.uf).join(''), true)
    case 'Data de nascimento':
      return linkBirth ? birth.label : null
    case 'Idade':
      return linkBirth ? String(birth.age) : null
    default:
      return null
  }
}

export function generateCustom(options: {
  columns: CustomColumn[]
  count: number
  seed: number
  referenceDate: Date
  consistent: boolean
}) {
  setReferenceDate(options.referenceDate)
  const random = rng(options.seed)
  const linkBirth = options.consistent
    && options.columns.some((column) => column.type === 'Data de nascimento' && column.rule === 'Válido')
    && options.columns.some((column) => column.type === 'Idade' && column.rule === 'Válido')
  const records: CustomRow[] = []
  const seenSku: string[] = []
  for (let index = 0; index < options.count; index += 1) {
    const individual = person(random, {})
    const birth = birthFor(random, options.referenceDate)
    const values: Record<string, string> = {}
    const checks: Record<string, 'passa' | 'falha'> = {}
    for (const column of options.columns) {
      const linked = options.consistent
        ? consistentCell(column, random, individual, birth, linkBirth)
        : null
      if (linked !== null) {
        values[column.name] = linked
        checks[column.name] = 'passa'
      } else {
        const special = specialCell(column, random, index, seenSku)
        if (special) {
          values[column.name] = special.text
          checks[column.name] = special.bad ? 'falha' : 'passa'
        } else {
          const cell = ctVal(column.type, column.rule, random, individual)
          values[column.name] = String(cell.t)
          checks[column.name] = cell.bad ? 'falha' : 'passa'
        }
      }
    }
    records.push({ values, checks })
  }
  return records
}

function specialCell(column: CustomColumn, random: () => number, index: number, seenSku: string[]) {
  const bad = column.rule === 'Inválido' || (column.rule === 'Misto' && random() < 0.5)
  if (column.type === 'SKU') {
    const length = column.extra?.skuLen ?? 8
    if (!bad) {
      let sku = skuValue(random, length)
      let guard = 0
      while (seenSku.includes(sku) && guard < 8) {
        sku = skuValue(random, length)
        guard += 1
      }
      seenSku.push(sku)
      return { text: sku, bad: false }
    }
    const mode = index % 3
    if (mode === 0) return { text: '', bad: true }
    if (mode === 1) return { text: seenSku[0] || skuValue(random, length), bad: true }
    return { text: `${skuValue(random, length)}EXTRA`, bad: true }
  }
  if (column.type === 'Descrição') {
    const size = column.extra?.descSize ?? 'Média'
    if (!bad) return { text: descriptionValue(random, size), bad: false }
    return index % 2 === 0
      ? { text: '', bad: true }
      : { text: descriptionValue(random, 'Extensa').repeat(6), bad: true }
  }
  if (column.type === 'Cor') {
    const format = column.extra?.colorFormat ?? 'HEX'
    const alpha = column.extra?.alpha ?? 100
    return { text: colorCell(random, bad, format, alpha), bad }
  }
  if (isMeasure(column.type)) {
    if (!bad) return { text: measureCell(column.type, random, false, column.extra), bad: false }
    const mode = index % 3
    if (mode === 0) return { text: '', bad: true }
    if (mode === 2) return { text: 'abc', bad: true }
    const unit = column.extra?.unit && unitsFor(column.type).includes(column.extra.unit) ? column.extra.unit : unitsFor(column.type)[0]
    const min = Number.isFinite(column.extra?.min) ? Number(column.extra?.min) : 1
    return { text: `${(min - 10).toLocaleString('pt-BR')} ${unit}`, bad: true }
  }
  return null
}

export function customToCsv(columns: CustomColumn[], records: CustomRow[]) {
  const headers = [
    ...columns.map((column) => column.name),
    ...columns.map((column) => `check_${column.name}`),
  ]
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(',')]
  for (const record of records) {
    const row = [
      ...columns.map((column) => record.values[column.name] ?? ''),
      ...columns.map((column) => record.checks[column.name] ?? ''),
    ]
    lines.push(row.map(escape).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}`
}

export function customToJson(columns: CustomColumn[], records: CustomRow[]) {
  const payload = records.map((record) => {
    const row: Record<string, string> = {}
    for (const column of columns) {
      row[column.name] = record.values[column.name] ?? ''
      row[`check_${column.name}`] = record.checks[column.name] ?? ''
    }
    return row
  })
  return JSON.stringify(payload, null, 2)
}
