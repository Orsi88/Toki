import { CASE_LIMIT, emptyPlan, planCase, type StrategyPlan } from './types.ts'

export type DecisionCondition = { id: string; name: string; values: string[] }
export type DecisionAction = { id: string; name: string }
export type DecisionRule = {
  id: string
  cells: Record<string, string>
  excluded: boolean
  actions: Record<string, string>
}

export type DecisionConfig = {
  conditions: DecisionCondition[]
  actions: DecisionAction[]
  rules: DecisionRule[]
}

export function defaultDecisionConfig(): DecisionConfig {
  const conditions = [
    { id: 'c1', name: 'Condição A', values: ['Sim', 'Não'] },
    { id: 'c2', name: 'Condição B', values: ['Sim', 'Não'] },
  ]
  const actions = [{ id: 'a1', name: 'Resultado' }]
  const built = decisionCombinations(conditions)
  return { conditions, actions, rules: mergeDecisionRules([], conditions, built.rows) }
}

export function mergeDecisionRules(
  rules: DecisionRule[],
  conditions: DecisionCondition[],
  rows: Record<string, string>[],
): DecisionRule[] {
  const key = (cells: Record<string, string>) => conditions.map((condition) => cells[condition.id] ?? '').join('\u0001')
  const previous = new Map(rules.map((rule) => [key(rule.cells), rule]))
  return rows.map((row) => previous.get(key(row)) ?? { id: `regra-${key(row)}`, cells: row, excluded: false, actions: {} })
}

export function decisionCombinationCount(conditions: DecisionCondition[]) {
  return conditions.reduce((product, condition) => product * Math.max(condition.values.length, 1), conditions.length ? 1 : 0)
}

export function decisionCombinations(conditions: DecisionCondition[]): { rows: Record<string, string>[]; error: string } {
  if (!conditions.length) return { rows: [], error: 'Informe ao menos uma condição.' }
  for (const condition of conditions) {
    if (!condition.values.length) return { rows: [], error: `A condição ${condition.name || 'sem nome'} não tem valores.` }
  }
  const total = decisionCombinationCount(conditions)
  if (total > CASE_LIMIT) {
    return { rows: [], error: `As condições formam ${total} combinações. O teto é ${CASE_LIMIT}. Nada foi preenchido pela metade.` }
  }
  const rows: Record<string, string>[] = []
  const walk = (index: number, current: Record<string, string>) => {
    if (index === conditions.length) {
      rows.push({ ...current })
      return
    }
    const condition = conditions[index]
    for (const value of condition.values) walk(index + 1, { ...current, [condition.id]: value })
  }
  walk(0, {})
  return { rows, error: '' }
}

export function planDecision(config: DecisionConfig): StrategyPlan {
  const errors: string[] = []
  if (!config.conditions.length) errors.push('Informe ao menos uma condição.')
  const names = new Set<string>()
  for (const condition of config.conditions) {
    const name = condition.name.trim()
    if (!name) errors.push('Toda condição precisa de um nome.')
    else if (names.has(name)) errors.push(`A condição ${name} está repetida.`)
    else names.add(name)
    if (!condition.values.length) errors.push(`A condição ${name || 'sem nome'} não tem valores.`)
    if (new Set(condition.values).size !== condition.values.length) errors.push(`A condição ${name || 'sem nome'} tem valores repetidos.`)
  }
  if (!config.rules.length) errors.push('Informe ao menos uma regra.')
  for (const rule of config.rules) {
    for (const condition of config.conditions) {
      const value = rule.cells[condition.id]
      if (!value) errors.push(`A regra ${rule.id} não preenche ${condition.name || 'uma condição'}.`)
      else if (value !== '*' && !condition.values.includes(value)) {
        errors.push(`O valor ${value} não pertence à condição ${condition.name}.`)
      }
    }
  }
  if (errors.length) return emptyPlan(errors)

  const active = config.rules.filter((rule) => !rule.excluded)
  const cases = active.map((rule, index) => {
    const expected = config.actions
      .map((action) => {
        const text = (rule.actions[action.id] ?? '').trim()
        return text ? `${action.name}: ${text}` : ''
      })
      .filter(Boolean)
      .join(' · ')
    return planCase(index + 1, config.conditions.map((condition) => ({
      key: condition.id,
      label: condition.name.trim(),
      value: rule.cells[condition.id] === '*' ? 'indiferente' : rule.cells[condition.id],
    })), `Regra ${index + 1}`, expected, true)
  })
  return {
    cases,
    possible: config.rules.length,
    excluded: config.rules.length - active.length,
    generated: cases.length,
    errors: [],
  }
}
