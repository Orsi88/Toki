export const CASE_LIMIT = 500
export const INTERACTION_LIMIT = 20_000
export const SEQUENCE_LENGTH_LIMIT = 6

export const LIMITS_NOTE = `Cada geração aceita até ${CASE_LIMIT} casos e até ${INTERACTION_LIMIT} pares ou trios na conta de cobertura. Acima disso a geração para e avisa o total, sem cortar o pedido.`

export type StrategyId =
  | 'particoes'
  | 'decisao'
  | 'combinacoes'
  | 'estados'
  | 'permissoes'
  | 'variacoes'
  | 'arquivos'

export type PlannedInput = { key: string; label: string; value: string; bind?: boolean }

export type PlannedCase = {
  id: string
  inputs: PlannedInput[]
  rule: string
  expected: string
  concrete: 'gerado' | 'pendente'
  note: string
  bindable: boolean
}

export type CoverageMeter = {
  covered: number
  total: number
  unit: 'pares' | 'trios' | 'combinações'
}

export type StrategyPlan = {
  cases: PlannedCase[]
  possible: number
  excluded: number
  generated: number
  coverage?: CoverageMeter
  detail?: string
  errors: string[]
}

export type ValueBinding = {
  ownerId: string
  value: string
  field: string
  generator: string
  rule: 'Válido' | 'Inválido'
}

export const STRATEGIES: { id: StrategyId; name: string; desc: string }[] = [
  {
    id: 'particoes',
    name: 'Partições e limites',
    desc: 'Classes válidas e inválidas, com valores abaixo, no limite e acima.',
  },
  {
    id: 'decisao',
    name: 'Tabela de decisão',
    desc: 'Condições, regras e ações esperadas informadas por você.',
  },
  {
    id: 'combinacoes',
    name: 'Combinações de parâmetros',
    desc: 'Todas as combinações, pares ou trios, com restrições entre valores.',
  },
  {
    id: 'estados',
    name: 'Estados e transições',
    desc: 'Situações ligadas por uma ação. Cada passo vira um caso.',
  },
  {
    id: 'permissoes',
    name: 'Matriz de permissões',
    desc: 'Perfis e ações com permitir, negar, condicional ou não definido.',
  },
  {
    id: 'variacoes',
    name: 'Variações controladas',
    desc: 'Uma massa base e alterações pontuais, um campo por caso.',
  },
]

export function emptyPlan(errors: string[], possible = 0, excluded = 0): StrategyPlan {
  return { cases: [], possible, excluded, generated: 0, errors }
}

export function planCase(
  index: number,
  inputs: PlannedInput[],
  rule: string,
  expected: string,
  bindable: boolean,
): PlannedCase {
  return {
    id: `caso-${index}`,
    inputs,
    rule,
    expected,
    concrete: bindable ? 'pendente' : 'gerado',
    note: bindable ? 'A massa concreta ainda não foi configurada.' : '',
    bindable,
  }
}
