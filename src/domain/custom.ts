import { cpfD, ctVal, fmtCpf, int, person, rng, setReferenceDate } from './mfEngine.ts'
import { colorCell, descriptionValue, isMeasure, measureCell, skuValue, unitsFor } from './values.ts'

export const COLUMN_TYPES = [
  'Nome completo', 'Nome', 'Sobrenome', 'CPF', 'CNPJ', 'E-mail', 'Telefone', 'CEP', 'Endereço',
  'Cidade', 'UF', 'Data de nascimento', 'Idade', 'Data', 'Data e hora', 'Número inteiro', 'Decimal',
  'Valor monetário', 'Porcentagem', 'Cor', 'Comprimento', 'Massa', 'Volume', 'Coordenada', 'Booleano', 'Status',
  'Texto curto', 'Descrição', 'Código (AAA-9999)', 'SKU', 'Cartão', 'Chave PIX', 'Conta bancária', 'UUID', 'Lista de opções',
  'Cópia de outra coluna',
] as const

export const DATE_TYPES = ['Data', 'Data de nascimento', 'Data e hora']

export type ColumnRule = 'Válido' | 'Inválido' | 'Misto'
export type ColumnExtra = {
  skuLen?: number
  descSize?: string
  unit?: string
  min?: number
  max?: number
  colorFormat?: string
  alpha?: number
  options?: string[]
  maxLength?: number
  /** Cópia de outra coluna: id da coluna copiada (senha → confirmação). */
  ref?: string
  /** Data / Data e hora: id da coluna de data que esta precisa seguir (início → fim). */
  after?: string
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
  return dependencyError(columns)
}

/** Coluna de que esta depende, quando o vínculo vale para o tipo dela. */
export function dependencyOf(column: CustomColumn) {
  if (column.type === 'Cópia de outra coluna') return column.extra?.ref
  if ((column.type === 'Data' || column.type === 'Data e hora') && column.extra?.after) return column.extra.after
  return undefined
}

function dependencyError(columns: CustomColumn[]) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  for (const column of columns) {
    const name = column.name.trim()
    if (column.type === 'Cópia de outra coluna' && !column.extra?.ref) return `Escolha a coluna que "${name}" copia.`
    const ref = dependencyOf(column)
    if (!ref) continue
    const target = byId.get(ref)
    if (!target) return `A coluna que "${name}" segue não existe mais.`
    if (target.id === column.id) return `"${name}" não pode depender de si mesma.`
    if (column.extra?.after && column.type !== 'Cópia de outra coluna' && !DATE_TYPES.includes(target.type)) {
      return `"${name}" só pode vir depois de uma coluna de data; "${target.name}" é ${target.type.toLowerCase()}.`
    }
  }
  try {
    dependencyOrder(columns)
  } catch (error) {
    return (error as Error).message
  }
  return null
}

/** Ordem de geração: cada coluna depois daquela de que depende. Lança erro em ciclo. */
export function dependencyOrder(columns: CustomColumn[]) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const state = new Map<string, 'visiting' | 'done'>()
  const order: CustomColumn[] = []
  const visit = (column: CustomColumn, path: string[]) => {
    if (state.get(column.id) === 'done') return
    if (state.get(column.id) === 'visiting') {
      throw new Error(`Dependência circular: ${[...path, column.name].join(' → ')}. Desfaça um dos vínculos.`)
    }
    state.set(column.id, 'visiting')
    const ref = dependencyOf(column)
    const target = ref ? byId.get(ref) : undefined
    if (target) visit(target, [...path, column.name])
    state.set(column.id, 'done')
    order.push(column)
  }
  for (const column of columns) visit(column, [])
  return order
}

function parseDateCell(text: string) {
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12)
    return date.getDate() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 ? date : null
  }
  match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(text)
  if (match) {
    const [, y, m, d, h, min, sec] = match.map(Number)
    const date = new Date(y, m - 1, d, h, min, sec)
    return date.getDate() === d && date.getMonth() === m - 1 && date.getHours() === h && min < 60 && sec < 60 ? date : null
  }
  return null
}

function formatDateCell(type: string, date: Date) {
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  if (type !== 'Data e hora') return day
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}-03:00`
}

function dependentCell(column: CustomColumn, source: string, random: () => number, index: number) {
  const bad = column.rule === 'Inválido' || (column.rule === 'Misto' && random() < 0.5)
  if (column.type === 'Cópia de outra coluna') {
    if (!bad) return { text: source, bad: false }
    return index % 2 === 0 || !source ? { text: `${source}x`, bad: true } : { text: '', bad: true }
  }
  const start = parseDateCell(source)
  if (!start) return null // a coluna de origem saiu inválida: esta segue a própria regra
  const date = new Date(start)
  if (!bad) {
    date.setDate(date.getDate() + int(random, 0, 365))
    if (column.type === 'Data e hora') date.setHours(int(random, 0, 23), int(random, 0, 59), int(random, 0, 59))
    if (date < start) date.setTime(start.getTime())
  } else {
    date.setDate(date.getDate() - int(random, 1, 365))
  }
  return { text: formatDateCell(column.type, date), bad }
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
  if (column.type === 'Lista de opções') {
    const options = (column.extra?.options ?? []).filter((option) => option.trim())
    if (options.length === 0) return `A lista de opções de "${name}" está vazia.`
  }
  if (column.type === 'Texto curto' && column.extra?.maxLength !== undefined) {
    const length = column.extra.maxLength
    if (!Number.isInteger(length) || length < 1 || length > 10000) return `O tamanho máximo de "${name}" precisa ser um inteiro de 1 a 10000.`
  }
  if (column.type === 'Número inteiro') {
    for (const [label, value] of [['mínimo', column.extra?.min], ['máximo', column.extra?.max]] as const) {
      if (value !== undefined && !Number.isInteger(value)) return `O ${label} de "${name}" precisa ser um número inteiro.`
    }
  }
  if (isMeasure(column.type) || column.type === 'Número inteiro') {
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
  if (type === 'Lista de opções') return { options: ['Opção A', 'Opção B'] }
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
  const order = dependencyOrder(options.columns)
  const nameOf = new Map(options.columns.map((column) => [column.id, column.name]))
  for (let index = 0; index < options.count; index += 1) {
    const individual = person(random, {})
    const birth = birthFor(random, options.referenceDate)
    const values: Record<string, string> = {}
    const checks: Record<string, 'passa' | 'falha'> = {}
    for (const column of order) {
      const ref = dependencyOf(column)
      const dependent = ref ? dependentCell(column, values[nameOf.get(ref) ?? ''] ?? '', random, index) : null
      if (dependent) {
        values[column.name] = dependent.text
        checks[column.name] = dependent.bad ? 'falha' : 'passa'
        continue
      }
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
  if (column.type === 'Lista de opções') {
    const options = (column.extra?.options ?? []).filter((option) => option.trim())
    if (!bad) return { text: options[Math.floor(random() * options.length)] ?? '', bad: false }
    return index % 2 === 0 ? { text: '', bad: true } : { text: 'Opção fora da lista', bad: true }
  }
  if (column.type === 'Texto curto' && column.extra?.maxLength !== undefined) {
    const limit = column.extra.maxLength
    if (!bad) return { text: String(ctVal('Texto curto', 'Válido', random, person(random, {})).t).slice(0, limit), bad: false }
    return index % 2 === 0 ? { text: '', bad: true } : { text: 'x'.repeat(limit + 1), bad: true }
  }
  if (column.type === 'Número inteiro' && (column.extra?.min !== undefined || column.extra?.max !== undefined)) {
    const min = column.extra?.min ?? Math.min(1, column.extra?.max ?? 1)
    const max = column.extra?.max ?? Math.max(1000, min)
    if (!bad) return { text: String(int(random, min, max)), bad: false }
    const mode = index % 3
    if (mode === 0) return { text: '', bad: true }
    if (mode === 1) return { text: 'abc', bad: true }
    return { text: String(column.extra?.max !== undefined ? max + 1 : min - 1), bad: true }
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
