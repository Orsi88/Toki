import { CASE_LIMIT, emptyPlan, planCase, type StrategyPlan } from './types.ts'

export type PermissionMark = 'permitir' | 'negar' | 'condicional' | 'indefinido'
export type PermissionItem = { id: string; name: string }

export type PermissionConfig = {
  profiles: PermissionItem[]
  actions: PermissionItem[]
  conditions: PermissionItem[]
  cells: Record<string, PermissionMark>
  expected: Record<string, string>
  conditionByCell: Record<string, string>
}

export function cellKey(profileId: string, actionId: string) {
  return `${profileId}|${actionId}`
}

export function defaultPermissionConfig(): PermissionConfig {
  return {
    profiles: [
      { id: 'f1', name: 'Perfil 1' },
      { id: 'f2', name: 'Perfil 2' },
    ],
    actions: [
      { id: 'a1', name: 'Ação 1' },
      { id: 'a2', name: 'Ação 2' },
    ],
    conditions: [{ id: 'k1', name: 'Condição 1' }],
    cells: {},
    expected: {},
    conditionByCell: {},
  }
}

const MARKS: Record<PermissionMark, string> = {
  permitir: 'Permitir.',
  negar: 'Negar.',
  condicional: 'Condicional.',
  indefinido: 'Não definido.',
}

export function planPermissions(config: PermissionConfig): StrategyPlan {
  const errors: string[] = []
  if (!config.profiles.length) errors.push('Informe ao menos um perfil.')
  if (!config.actions.length) errors.push('Informe ao menos uma ação.')
  const total = config.profiles.length * config.actions.length
  if (total > CASE_LIMIT) {
    return emptyPlan([`A grade tem ${total} células. O teto é ${CASE_LIMIT}. Nada foi gerado pela metade.`], total, 0)
  }
  for (const item of [...config.profiles, ...config.actions, ...config.conditions]) {
    if (!item.name.trim()) errors.push('Todo perfil, ação e condição precisa de um nome.')
  }
  const cases = []
  for (const profile of config.profiles) {
    for (const action of config.actions) {
      const key = cellKey(profile.id, action.id)
      const mark = config.cells[key] ?? 'indefinido'
      const conditionId = config.conditionByCell[key] ?? ''
      const condition = config.conditions.find((item) => item.id === conditionId)
      if (mark === 'condicional' && !condition) {
        errors.push(`A célula ${profile.name || 'perfil'} × ${action.name || 'ação'} está condicional sem condição.`)
      }
      cases.push(planCase(cases.length + 1, [
        { key: 'perfil', label: 'Perfil', value: profile.name.trim() },
        { key: 'acao', label: 'Ação', value: action.name.trim() },
        { key: 'condicao', label: 'Condição', value: mark === 'condicional' ? (condition?.name.trim() || '') : '' },
      ], MARKS[mark], (config.expected[key] ?? '').trim(), true))
    }
  }
  if (errors.length) return emptyPlan(errors, total, 0)
  return { cases, possible: total, excluded: 0, generated: cases.length, errors: [] }
}
