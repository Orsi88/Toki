import { emptyPlan, planCase, type PlannedCase, type StrategyPlan } from './types.ts'

export type VariationKind = 'ausente' | 'null' | 'vazio' | 'espacos' | 'limite' | 'duplicidade'

export type VariationConfig = {
  baseText: string
  fields: string[]
  changes: VariationKind[]
  onePerCase: boolean
  limit: number
}

export function defaultVariationConfig(): VariationConfig {
  return {
    baseText: '{\n  "nome": "Ana",\n  "cidade": "Recife"\n}',
    fields: ['nome'],
    changes: ['vazio'],
    onePerCase: true,
    limit: 10,
  }
}

const CHANGE_LABEL: Record<VariationKind, string> = {
  ausente: 'Campo ausente',
  null: 'Nulo',
  vazio: 'Vazio',
  espacos: 'Só espaços',
  limite: 'Limite excedido',
  duplicidade: 'Duplicidade',
}

export function planVariations(config: VariationConfig): StrategyPlan {
  const parsed = parseBase(config.baseText)
  if (typeof parsed === 'string') return emptyPlan([parsed])
  const base = parsed
  const keys = Object.keys(base)
  if (!keys.length) return emptyPlan(['O registro base não tem campos.'])
  const fields = (config.fields.length ? config.fields : keys).filter((field) => keys.includes(field))
  const missing = (config.fields.length ? config.fields : []).filter((field) => !keys.includes(field))
  if (missing.length) return emptyPlan([`O campo ${missing[0]} não está no registro base.`])
  if (!fields.length) return emptyPlan(['Selecione ao menos um campo da base.'])
  if (!config.changes.length) return emptyPlan(['Selecione ao menos uma alteração.'])
  if (!Number.isInteger(config.limit) || config.limit < 0) return emptyPlan(['O limite de caracteres precisa ser um inteiro a partir de zero.'])
  const changes = config.changes.filter((change) => change !== 'duplicidade')
  for (const field of fields) {
    if (changes.includes('limite') && typeof base[field] !== 'string') {
      return emptyPlan([`O campo ${field} não é texto. Limite excedido só se aplica a texto.`])
    }
  }

  const cases: PlannedCase[] = []
  const push = (record: Record<string, unknown>, field: string, change: VariationKind, rule: string, role = '') => {
    const inputs = [
      { key: 'campo', label: 'Campo', value: field },
      { key: 'alteracao', label: 'Alteração', value: CHANGE_LABEL[change] },
      { key: 'base', label: 'Base', value: JSON.stringify(base) },
      { key: 'variacao', label: 'Variação', value: JSON.stringify(record) },
    ]
    if (role) inputs.unshift({ key: 'papel', label: 'Papel', value: role })
    cases.push(planCase(cases.length + 1, inputs, rule, '', false))
  }

  if (config.onePerCase) {
    for (const field of fields) {
      for (const change of changes) {
        const next = { ...base }
        push(apply(next, field, change, config.limit), field, change, ruleOf(field, change, config.limit))
      }
    }
  } else if (changes.length) {
    for (const change of changes) {
      const next = { ...base }
      for (const field of fields) apply(next, field, change, config.limit)
      push(next, fields.join(', '), change, fields.map((field) => ruleOf(field, change, config.limit)).join(' '))
    }
  }

  if (config.changes.includes('duplicidade')) {
    const group = cases.length
    const original = planCase(group + 1, [
      { key: 'conjunto', label: 'Conjunto', value: String(group + 1) },
      { key: 'papel', label: 'Papel', value: 'Original' },
      { key: 'campo', label: 'Campo', value: fields.join(', ') },
      { key: 'alteracao', label: 'Alteração', value: CHANGE_LABEL.duplicidade },
      { key: 'base', label: 'Base', value: JSON.stringify(base) },
      { key: 'variacao', label: 'Variação', value: JSON.stringify(base) },
    ], 'Registro original do conjunto.', '', false)
    const duplicate = planCase(group + 2, [
      { key: 'conjunto', label: 'Conjunto', value: String(group + 1) },
      { key: 'papel', label: 'Papel', value: 'Duplicado' },
      { key: 'campo', label: 'Campo', value: fields.join(', ') },
      { key: 'alteracao', label: 'Alteração', value: CHANGE_LABEL.duplicidade },
      { key: 'base', label: 'Base', value: JSON.stringify(base) },
      { key: 'variacao', label: 'Variação', value: JSON.stringify(base) },
    ], 'Registro duplicado do conjunto.', '', false)
    cases.push(original, duplicate)
  }

  return { cases, possible: cases.length, excluded: 0, generated: cases.length, errors: [] }
}

function parseBase(text: string): Record<string, unknown> | string {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return 'O registro base não é um JSON válido.'
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'O registro base precisa ser um objeto JSON.'
  return value as Record<string, unknown>
}

function apply(record: Record<string, unknown>, field: string, change: VariationKind, limit: number) {
  if (change === 'ausente') delete record[field]
  else if (change === 'null') record[field] = null
  else if (change === 'vazio') record[field] = ''
  else if (change === 'espacos') record[field] = '   '
  else if (change === 'limite') record[field] = exceed(String(record[field] ?? ''), limit)
  return record
}

function exceed(value: string, limit: number) {
  if (value.length > limit) return `${value}x`
  return value + 'x'.repeat(limit - value.length + 1)
}

function ruleOf(field: string, change: VariationKind, limit: number) {
  if (change === 'ausente') return `Campo ${field} ausente.`
  if (change === 'null') return `Campo ${field} nulo.`
  if (change === 'vazio') return `Campo ${field} vazio.`
  if (change === 'espacos') return `Campo ${field} só com espaços.`
  return `Limite de ${limit} caracteres excedido no campo ${field}.`
}
