// Motor do Toki empacotado para a extensão (npm run build:extension → dist-extension/engine.js).
// A extensão usa os mesmos geradores da Massa Personalizada; não existe um segundo motor.
import { COLUMN_TYPES, defaultExtra, generateCustom, type CustomColumn } from '../domain/custom.ts'

export type Rule = 'Válido' | 'Inválido'

/** Tipos que fazem sentido sozinhos num campo (lista e cópia dependem de configuração). */
export const TYPES = COLUMN_TYPES.filter((type) => type !== 'Lista de opções' && type !== 'Cópia de outra coluna')

export const PERSON = ['Nome completo', 'CPF', 'Data de nascimento', 'E-mail', 'Telefone', 'CEP', 'Endereço', 'Cidade', 'UF'] as const

function seed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Um valor de um tipo, com o rótulo de validade que o gerador atribuiu. */
export function one(type: string, rule: Rule = 'Válido') {
  const column: CustomColumn = { id: 'v', name: 'v', type, rule, extra: defaultExtra(type) }
  const [row] = generateCustom({ columns: [column], count: 1, seed: seed(), referenceDate: new Date(), consistent: false })
  return { value: row.values.v, ok: row.checks.v === 'passa' }
}

/** Uma pessoa coerente: nome, CPF da UF, e-mail e endereço saem da mesma pessoa. */
export function person(rule: Rule = 'Válido') {
  const columns = PERSON.map((type) => ({ id: type, name: type, type, rule }))
  const [row] = generateCustom({ columns, count: 1, seed: seed(), referenceDate: new Date(), consistent: true })
  return PERSON.map((type) => ({ type, value: row.values[type], ok: row.checks[type] === 'passa' }))
}

/** Uma linha para preencher um formulário capturado, respeitando opções, limites e vínculos. */
export function row(columns: CustomColumn[]) {
  const [record] = generateCustom({ columns, count: 1, seed: seed(), referenceDate: new Date(), consistent: true })
  return record
}
