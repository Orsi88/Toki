import { CASE_LIMIT, SEQUENCE_LENGTH_LIMIT, emptyPlan, planCase, type PlannedCase, type StrategyPlan } from './types.ts'

export type StateNode = { id: string; name: string }
export type StateEvent = { id: string; name: string }
export type StateTransition = { id: string; fromId: string; eventId: string; toId: string; expected: string }
export type StateForbidden = { id: string; fromId: string; eventId: string; toId: string; expected: string }

export type StateConfig = {
  states: StateNode[]
  initialId: string
  events: StateEvent[]
  transitions: StateTransition[]
  forbidden: StateForbidden[]
  length: number
  count: number | null
}

export function defaultStateConfig(): StateConfig {
  return {
    states: [
      { id: 's1', name: 'Aberto' },
      { id: 's2', name: 'Fechado' },
    ],
    initialId: 's1',
    events: [{ id: 'e1', name: 'fechar' }],
    transitions: [{ id: 't1', fromId: 's1', eventId: 'e1', toId: 's2', expected: '' }],
    forbidden: [],
    length: 1,
    count: null,
  }
}

export function planStates(config: StateConfig): StrategyPlan {
  const errors = validate(config)
  if (errors.length) return emptyPlan(errors)
  const names = new Map(config.states.map((state) => [state.id, state.name.trim()]))
  const events = new Map(config.events.map((event) => [event.id, event.name.trim()]))
  let paths: { steps: StateTransition[] }[] = [{ steps: [] }]
  for (let step = 0; step < config.length; step += 1) {
    const next: { steps: StateTransition[] }[] = []
    for (const path of paths) {
      const from = path.steps.length ? path.steps[path.steps.length - 1].toId : config.initialId
      for (const transition of config.transitions) {
        if (transition.fromId === from) next.push({ steps: [...path.steps, transition] })
      }
    }
    if (next.length > CASE_LIMIT) {
      return emptyPlan([`Há mais de ${CASE_LIMIT} sequências no passo ${step + 1}. O teto é ${CASE_LIMIT}. Reduza o comprimento ou as transições. Nada foi cortado.`])
    }
    paths = next
  }
  const available = paths.length
  if (config.count !== null && config.count > available) {
    return emptyPlan([`Há ${available} sequências de comprimento ${config.length}. O pedido foi ${config.count}.`], available, 0)
  }
  if (!available && !config.forbidden.length) {
    return emptyPlan(['Não há sequência com esse comprimento a partir do estado inicial. Ligações ausentes não entram como proibição.'])
  }
  const selected = config.count === null ? paths : paths.slice(0, config.count)
  const cases: PlannedCase[] = []
  selected.forEach((path, sequence) => {
    path.steps.forEach((step, index) => {
      cases.push(planCase(cases.length + 1, [
        { key: 'sequencia', label: 'Sequência', value: String(sequence + 1), bind: false },
        { key: 'passo', label: 'Passo', value: String(index + 1), bind: false },
        { key: 'estado_anterior', label: 'Estado anterior', value: names.get(step.fromId) || '' },
        { key: 'evento', label: 'Evento', value: events.get(step.eventId) || '' },
        { key: 'estado_esperado', label: 'Estado esperado', value: names.get(step.toId) || '' },
      ], `Transição cadastrada de ${names.get(step.fromId)} para ${names.get(step.toId)}.`, step.expected.trim(), true))
    })
  })
  for (const item of config.forbidden) {
    cases.push(planCase(cases.length + 1, [
      { key: 'sequencia', label: 'Sequência', value: 'proibida', bind: false },
      { key: 'passo', label: 'Passo', value: '1', bind: false },
      { key: 'estado_anterior', label: 'Estado anterior', value: names.get(item.fromId) || '' },
      { key: 'evento', label: 'Evento', value: events.get(item.eventId) || '' },
      { key: 'estado_esperado', label: 'Estado esperado', value: names.get(item.toId) || '' },
    ], `Transição proibida de ${names.get(item.fromId)} com ${events.get(item.eventId)} para ${names.get(item.toId)}.`, item.expected.trim(), true))
  }
  if (cases.length > CASE_LIMIT) {
    return emptyPlan([`Os casos passariam de ${CASE_LIMIT}. O teto é ${CASE_LIMIT}. Nada foi cortado.`], available, 0)
  }
  return {
    cases,
    possible: available,
    excluded: 0,
    generated: cases.length,
    detail: config.count !== null && config.count < available
      ? `Mostrando ${config.count} de ${available} sequências possíveis.`
      : undefined,
    errors: [],
  }
}

function validate(config: StateConfig) {
  const errors: string[] = []
  if (!config.states.length) errors.push('Informe ao menos um estado.')
  if (!config.events.length) errors.push('Informe ao menos um evento.')
  if (!config.states.some((state) => state.id === config.initialId)) errors.push('O estado inicial não está na lista.')
  if (!Number.isInteger(config.length) || config.length < 1 || config.length > SEQUENCE_LENGTH_LIMIT) {
    errors.push(`O comprimento da sequência precisa ser um inteiro de 1 a ${SEQUENCE_LENGTH_LIMIT}.`)
  }
  if (config.count !== null && (!Number.isInteger(config.count) || config.count < 1)) {
    errors.push('A quantidade de sequências precisa ser um inteiro a partir de 1, ou ficar em branco para gerar todas.')
  }
  const stateNames = new Set<string>()
  for (const state of config.states) {
    const name = state.name.trim()
    if (!name) errors.push('Todo estado precisa de um nome.')
    else if (stateNames.has(name)) errors.push(`O estado ${name} está repetido.`)
    else stateNames.add(name)
  }
  const eventNames = new Set<string>()
  for (const event of config.events) {
    const name = event.name.trim()
    if (!name) errors.push('Todo evento precisa de um nome.')
    else if (eventNames.has(name)) errors.push(`O evento ${name} está repetido.`)
    else eventNames.add(name)
  }
  const seen = new Set<string>()
  for (const transition of config.transitions) {
    if (!known(config, transition.fromId, transition.eventId, transition.toId)) {
      errors.push('Há uma transição com estado ou evento fora da lista.')
      continue
    }
    const key = `${transition.fromId}|${transition.eventId}|${transition.toId}`
    if (seen.has(key)) errors.push('Há uma transição repetida.')
    seen.add(key)
  }
  const banned = new Set<string>()
  for (const item of config.forbidden) {
    if (!known(config, item.fromId, item.eventId, item.toId)) {
      errors.push('Há uma proibição com estado ou evento fora da lista.')
      continue
    }
    const key = `${item.fromId}|${item.eventId}|${item.toId}`
    if (seen.has(key)) errors.push('A mesma transição está cadastrada e marcada como proibida.')
    if (banned.has(key)) errors.push('Há uma proibição repetida.')
    banned.add(key)
  }
  return errors
}

function known(config: StateConfig, fromId: string, eventId: string, toId: string) {
  return config.states.some((state) => state.id === fromId)
    && config.states.some((state) => state.id === toId)
    && config.events.some((event) => event.id === eventId)
}
