import { CASE_LIMIT, INTERACTION_LIMIT, emptyPlan, planCase, type StrategyPlan } from './types.ts'

export type ComboParameter = { id: string; name: string; values: string[] }
export type ComboConstraint = { id: string; leftId: string; leftValue: string; rightId: string; rightValue: string }
export type ComboMode = 'todas' | 'pares' | 'trios'

export type ComboConfig = {
  parameters: ComboParameter[]
  constraints: ComboConstraint[]
  mode: ComboMode
}

type Interaction = { keys: string[]; values: string[] }

export function defaultComboConfig(): ComboConfig {
  return {
    parameters: [
      { id: 'p1', name: 'Parâmetro A', values: ['1', '2'] },
      { id: 'p2', name: 'Parâmetro B', values: ['1', '2'] },
      { id: 'p3', name: 'Parâmetro C', values: ['1', '2'] },
    ],
    constraints: [],
    mode: 'pares',
  }
}

export function planCombinations(config: ComboConfig): StrategyPlan {
  const errors = validate(config)
  if (errors.length) return emptyPlan(errors)
  const parameters = config.parameters.map((parameter) => ({ ...parameter, name: parameter.name.trim() }))
  const product = parameters.reduce((total, parameter) => total * parameter.values.length, 1)
  if (config.mode === 'todas') return planAll(parameters, config.constraints, product)
  const strength = config.mode === 'trios' ? 3 : 2
  if (parameters.length < strength) {
    return emptyPlan([strength === 3 ? 'Trios precisam de ao menos três parâmetros.' : 'Pares precisam de ao menos dois parâmetros.'])
  }
  const space = interactionCount(parameters, strength)
  if (space > INTERACTION_LIMIT) {
    return emptyPlan([`A conta tem ${space} ${strength === 3 ? 'trios' : 'pares'}. O teto é ${INTERACTION_LIMIT}. Nada foi coberto pela metade.`], product, 0)
  }
  const all = interactions(parameters, strength)
  const targets = all.filter((item) => !forbiddenInteraction(item, config.constraints))
  const excluded = all.length - targets.length
  const rows: Record<string, string>[] = []
  let uncovered = targets
  while (uncovered.length) {
    const seed = uncovered[0]
    const assignment: Record<string, string> = {}
    seed.keys.forEach((key, index) => { assignment[key] = seed.values[index] })
    for (const parameter of parameters) {
      if (assignment[parameter.id] !== undefined) continue
      let best = ''
      let bestScore = -1
      for (const value of parameter.values) {
        const trial = { ...assignment, [parameter.id]: value }
        if (!partialAllowed(trial, config.constraints)) continue
        const score = countCovered(trial, uncovered)
        if (score > bestScore) {
          bestScore = score
          best = value
        }
      }
      if (bestScore < 0) {
        return emptyPlan([`Não há valor de ${parameter.name} compatível com as restrições para cobrir ${seed.values.join(' + ')}.`])
      }
      assignment[parameter.id] = best
    }
    if (!covers(assignment, seed) || !tupleAllowed(assignment, config.constraints)) {
      return emptyPlan([`A restrição impede cobrir ${seed.values.join(' + ')}.`])
    }
    rows.push(assignment)
    if (rows.length > CASE_LIMIT) {
      return emptyPlan([`A cobertura passou de ${CASE_LIMIT} casos. Nada foi cortado; reduza parâmetros ou valores.`])
    }
    uncovered = uncovered.filter((item) => !covers(assignment, item))
  }
  const covered = targets.filter((item) => rows.some((row) => covers(row, item))).length
  return {
    cases: rows.map((row, index) => planCase(index + 1, parameters.map((parameter) => ({
      key: parameter.id,
      label: parameter.name,
      value: row[parameter.id],
    })), 'Combinação permitida', '', false)),
    possible: all.length,
    excluded,
    generated: rows.length,
    detail: `O produto cartesiano tem ${product} combinações.`,
    coverage: { covered, total: targets.length, unit: strength === 3 ? 'trios' : 'pares' },
    errors: [],
  }
}

function planAll(parameters: ComboParameter[], constraints: ComboConstraint[], product: number): StrategyPlan {
  if (product > CASE_LIMIT) {
    return emptyPlan([`O produto cartesiano tem ${product} combinações. O teto é ${CASE_LIMIT}. Nada foi gerado pela metade.`], product, 0)
  }
  const rows: Record<string, string>[] = []
  const walk = (index: number, current: Record<string, string>) => {
    if (index === parameters.length) {
      rows.push({ ...current })
      return
    }
    const parameter = parameters[index]
    for (const value of parameter.values) walk(index + 1, { ...current, [parameter.id]: value })
  }
  walk(0, {})
  const allowed = rows.filter((row) => tupleAllowed(row, constraints))
  return {
    cases: allowed.map((row, index) => planCase(index + 1, parameters.map((parameter) => ({
      key: parameter.id,
      label: parameter.name,
      value: row[parameter.id],
    })), 'Combinação permitida', '', false)),
    possible: product,
    excluded: product - allowed.length,
    generated: allowed.length,
    coverage: { covered: allowed.length, total: allowed.length, unit: 'combinações' },
    errors: [],
  }
}

function validate(config: ComboConfig) {
  const errors: string[] = []
  if (config.parameters.length < 1) errors.push('Informe ao menos um parâmetro.')
  const names = new Set<string>()
  const known = new Map(config.parameters.map((parameter) => [parameter.id, parameter]))
  for (const parameter of config.parameters) {
    const name = parameter.name.trim()
    if (!name) errors.push('Todo parâmetro precisa de um nome.')
    else if (names.has(name)) errors.push(`O parâmetro ${name} está repetido.`)
    else names.add(name)
    if (!parameter.values.length) errors.push(`O parâmetro ${name || 'sem nome'} não tem valores.`)
    if (new Set(parameter.values).size !== parameter.values.length) errors.push(`O parâmetro ${name || 'sem nome'} tem valores repetidos.`)
  }
  for (const constraint of config.constraints) {
    if (constraint.leftId === constraint.rightId) {
      errors.push('A restrição precisa ligar parâmetros diferentes.')
      continue
    }
    const left = known.get(constraint.leftId)
    const right = known.get(constraint.rightId)
    if (!left || !right) {
      errors.push('A restrição aponta para um parâmetro que não existe.')
      continue
    }
    if (!left.values.includes(constraint.leftValue) || !right.values.includes(constraint.rightValue)) {
      errors.push(`A restrição usa um valor que não está em ${left.name} ou ${right.name}.`)
    }
  }
  return errors
}

function interactionCount(parameters: ComboParameter[], strength: number) {
  let total = 0
  const pick = (start: number, chosen: ComboParameter[]) => {
    if (chosen.length === strength) {
      total += chosen.reduce((count, parameter) => count * parameter.values.length, 1)
      return
    }
    for (let index = start; index < parameters.length; index += 1) pick(index + 1, [...chosen, parameters[index]])
  }
  pick(0, [])
  return total
}

function interactions(parameters: ComboParameter[], strength: number): Interaction[] {
  const chosen: Interaction[] = []
  const pick = (start: number, keys: string[], lists: string[][]) => {
    if (keys.length === strength) {
      const walk = (index: number, values: string[]) => {
        if (index === lists.length) {
          chosen.push({ keys: [...keys], values: [...values] })
          return
        }
        for (const value of lists[index]) walk(index + 1, [...values, value])
      }
      walk(0, [])
      return
    }
    for (let index = start; index < parameters.length; index += 1) {
      pick(index + 1, [...keys, parameters[index].id], [...lists, parameters[index].values])
    }
  }
  pick(0, [], [])
  return chosen
}

function forbiddenInteraction(item: Interaction, constraints: ComboConstraint[]) {
  for (let left = 0; left < item.keys.length; left += 1) {
    for (let right = left + 1; right < item.keys.length; right += 1) {
      if (pairForbidden(item.keys[left], item.values[left], item.keys[right], item.values[right], constraints)) return true
    }
  }
  return false
}

function pairForbidden(leftId: string, leftValue: string, rightId: string, rightValue: string, constraints: ComboConstraint[]) {
  return constraints.some((constraint) => (
    (constraint.leftId === leftId && constraint.leftValue === leftValue && constraint.rightId === rightId && constraint.rightValue === rightValue)
    || (constraint.leftId === rightId && constraint.leftValue === rightValue && constraint.rightId === leftId && constraint.rightValue === leftValue)
  ))
}

function tupleAllowed(row: Record<string, string>, constraints: ComboConstraint[]) {
  return constraints.every((constraint) => row[constraint.leftId] !== constraint.leftValue || row[constraint.rightId] !== constraint.rightValue)
}

function partialAllowed(row: Record<string, string>, constraints: ComboConstraint[]) {
  return constraints.every((constraint) => {
    const left = row[constraint.leftId]
    const right = row[constraint.rightId]
    if (left === undefined || right === undefined) return true
    return left !== constraint.leftValue || right !== constraint.rightValue
  })
}

function covers(row: Record<string, string>, item: Interaction) {
  return item.keys.every((key, index) => row[key] === item.values[index])
}

function countCovered(row: Record<string, string>, items: Interaction[]) {
  let score = 0
  for (const item of items) {
    if (item.keys.every((key) => row[key] !== undefined) && covers(row, item)) score += 1
  }
  return score
}
