import { describe, expect, it } from 'vitest'
import { planCombinations } from '../src/domain/strategy/combinations.ts'
import { decisionCombinations, defaultDecisionConfig, mergeDecisionRules, planDecision } from '../src/domain/strategy/decision.ts'
import { strategyToCsv, strategyToJson } from '../src/domain/strategy/export.ts'
import { planFileCombos } from '../src/domain/strategy/files.ts'
import { materialize } from '../src/domain/strategy/materialize.ts'
import { planPartitions } from '../src/domain/strategy/partitions.ts'
import { cellKey, planPermissions } from '../src/domain/strategy/permissions.ts'
import { planStates } from '../src/domain/strategy/states.ts'
import { rng } from '../src/domain/mfEngine.ts'
import { planVariations } from '../src/domain/strategy/variations.ts'

function values(plan: { cases: { inputs: { key: string; value: string }[]; rule: string; expected: string; concrete: string; note: string }[] }) {
  return plan.cases.map((item) => ({
    valor: item.inputs.find((input) => input.key === 'valor')?.value,
    ponto: item.inputs.find((input) => input.key === 'ponto')?.value,
    rule: item.rule,
    expected: item.expected,
    concrete: item.concrete,
    note: item.note,
  }))
}

describe('partições e limites', () => {
  it('gera abaixo, nos limites e acima do intervalo fechado', () => {
    const { plan } = planPartitions({
      type: 'numero', min: '0', max: '10', includeMin: true, includeMax: true, step: '1',
      validClasses: [], invalidClasses: [],
    })
    expect(plan.errors).toEqual([])
    expect(values(plan).map((item) => item.valor)).toEqual(['-1', '0', '5', '10', '11'])
    expect(values(plan)[0].rule).toBe('Abaixo do mínimo 0.')
    expect(values(plan)[4].rule).toBe('Acima do máximo 10.')
    expect(values(plan).every((item) => item.expected === '')).toBe(true)
  })

  it('marca o limite excluído com a restrição', () => {
    const { plan } = planPartitions({
      type: 'numero', min: '0', max: '10', includeMin: false, includeMax: true, step: '1',
      validClasses: [], invalidClasses: [],
    })
    expect(values(plan)[1].rule).toBe('Limite mínimo 0 excluído.')
    expect(values(plan)[1].valor).toBe('0')
  })

  it('recusa mínimo acima do máximo e intervalo vazio', () => {
    expect(planPartitions({
      type: 'numero', min: '8', max: '1', includeMin: true, includeMax: true, step: '1',
      validClasses: [], invalidClasses: [],
    }).plan.errors[0]).toMatch(/mínimo está acima/)
    expect(planPartitions({
      type: 'numero', min: '1', max: '1', includeMin: false, includeMax: false, step: '1',
      validClasses: [], invalidClasses: [],
    }).plan.cases).toEqual([])
  })

  it('representa uma classe inválida sem trocar o rótulo pela restrição', () => {
    const { plan } = planPartitions({
      type: 'numero', min: '0', max: '10', includeMin: true, includeMax: true, step: '1',
      validClasses: [], invalidClasses: [{ id: 'c', name: 'negativos', from: '-5', to: '-1' }],
    })
    const extra = plan.cases.at(-1)
    expect(extra?.rule).toBe('Classe inválida negativos: de -5 a -1.')
    expect(extra?.inputs[0].value).toBe('-3')
  })
})

describe('tabela de decisão', () => {
  const base = {
    conditions: [
      { id: 'c1', name: 'Idade', values: ['maior', 'menor'] },
      { id: 'c2', name: 'Status', values: ['ativo', 'inativo'] },
    ],
    actions: [{ id: 'a1', name: 'Resultado' }],
  }

  it('preserva indiferente, exclusão e resultado só quando informado', () => {
    const plan = planDecision({
      ...base,
      rules: [
        { id: 'r1', cells: { c1: '*', c2: 'ativo' }, excluded: false, actions: { a1: '' } },
        { id: 'r2', cells: { c1: 'menor', c2: 'inativo' }, excluded: true, actions: { a1: 'não deveria aparecer' } },
        { id: 'r3', cells: { c1: 'maior', c2: 'ativo' }, excluded: false, actions: { a1: 'segue' } },
      ],
    })
    expect(plan.excluded).toBe(1)
    expect(plan.generated).toBe(2)
    expect(plan.cases[0].inputs.map((input) => input.value)).toEqual(['indiferente', 'ativo'])
    expect(plan.cases[0].expected).toBe('')
    expect(plan.cases[1].expected).toBe('Resultado: segue')
    expect(plan.cases.every((item) => item.concrete === 'pendente')).toBe(true)
  })

  it('remonta as combinações e guarda o resultado já escrito', () => {
    const config = defaultDecisionConfig()
    config.rules[0].actions.a1 = 'segue'
    const conditions = config.conditions.map((item, index) => index === 0 ? { ...item, values: ['Sim', 'Não', 'Talvez'] } : item)
    const built = decisionCombinations(conditions)
    const rules = mergeDecisionRules(config.rules, conditions, built.rows)
    expect(rules).toHaveLength(6)
    expect(rules.find((rule) => rule.cells.c1 === 'Sim' && rule.cells.c2 === 'Sim')?.actions.a1).toBe('segue')
    expect(rules.find((rule) => rule.cells.c1 === 'Talvez')?.actions.a1 ?? '').toBe('')
  })
})

describe('combinações', () => {
  const parameters = [
    { id: 'a', name: 'A', values: ['a1', 'a2'] },
    { id: 'b', name: 'B', values: ['b1', 'b2'] },
    { id: 'c', name: 'C', values: ['c1', 'c2'] },
  ]

  it('cobre os 12 pares em 4 casos', () => {
    const plan = planCombinations({ parameters, constraints: [], mode: 'pares' })
    expect(plan.errors).toEqual([])
    expect(plan.coverage).toEqual({ covered: 12, total: 12, unit: 'pares' })
    expect(plan.cases.map((item) => item.inputs.map((input) => input.value))).toEqual([
      ['a1', 'b1', 'c1'],
      ['a1', 'b2', 'c2'],
      ['a2', 'b1', 'c2'],
      ['a2', 'b2', 'c1'],
    ])
  })

  it('tira o par proibido da cobertura e das linhas', () => {
    const plan = planCombinations({
      parameters,
      constraints: [{ id: 'x', leftId: 'a', leftValue: 'a1', rightId: 'b', rightValue: 'b1' }],
      mode: 'pares',
    })
    expect(plan.coverage).toEqual({ covered: 11, total: 11, unit: 'pares' })
    expect(plan.excluded).toBe(1)
    expect(plan.cases.some((item) => item.inputs[0].value === 'a1' && item.inputs[1].value === 'b1')).toBe(false)
  })

  it('recusa o produto cartesiano acima do teto sem entregar parte', () => {
    const wide = ['a', 'b', 'c'].map((id) => ({
      id,
      name: id,
      values: Array.from({ length: 8 }, (_, index) => String(index)),
    }))
    const plan = planCombinations({ parameters: wide, constraints: [], mode: 'todas' })
    expect(plan.cases).toEqual([])
    expect(plan.errors[0]).toMatch(/512/)
    expect(plan.errors[0]).toMatch(/500/)
  })

  it('cobre os trios permitidos', () => {
    const plan = planCombinations({ parameters, constraints: [], mode: 'trios' })
    expect(plan.coverage?.unit).toBe('trios')
    expect(plan.coverage?.covered).toBe(plan.coverage?.total)
    expect(plan.coverage?.total).toBe(8)
  })
})

describe('estados e transições', () => {
  const states = [{ id: 'a', name: 'Aberto' }, { id: 'b', name: 'Fechado' }]
  const events = [{ id: 'e', name: 'fechar' }]

  it('não trata ligação ausente como proibição', () => {
    const plan = planStates({
      states, initialId: 'a', events,
      transitions: [{ id: 't', fromId: 'a', eventId: 'e', toId: 'b', expected: '' }],
      forbidden: [],
      length: 2,
      count: null,
    })
    expect(plan.cases).toEqual([])
    expect(plan.errors[0]).toMatch(/não entram como proibição/)
  })

  it('gera a sequência cadastrada e a proibição explícita', () => {
    const plan = planStates({
      states, initialId: 'a', events,
      transitions: [{ id: 't', fromId: 'a', eventId: 'e', toId: 'b', expected: 'ok' }],
      forbidden: [{ id: 'f', fromId: 'b', eventId: 'e', toId: 'a', expected: '' }],
      length: 1,
      count: null,
    })
    expect(plan.errors).toEqual([])
    expect(plan.cases).toHaveLength(2)
    expect(plan.cases[0].inputs.map((input) => input.value)).toEqual(['1', '1', 'Aberto', 'fechar', 'Fechado'])
    expect(plan.cases[0].expected).toBe('ok')
    expect(plan.cases[1].rule).toBe('Transição proibida de Fechado com fechar para Aberto.')
    expect(plan.cases[1].expected).toBe('')
  })
})

describe('permissões', () => {
  it('não inventa resultado para célula não definida', () => {
    const plan = planPermissions({
      profiles: [{ id: 'p', name: 'Visitante' }],
      actions: [{ id: 'a', name: 'Editar' }, { id: 'b', name: 'Ler' }],
      conditions: [],
      cells: { [cellKey('p', 'b')]: 'permitir' },
      expected: { [cellKey('p', 'b')]: 'abre a lista' },
      conditionByCell: {},
    })
    expect(plan.cases[0].rule).toBe('Não definido.')
    expect(plan.cases[0].expected).toBe('')
    expect(plan.cases[1].rule).toBe('Permitir.')
    expect(plan.cases[1].expected).toBe('abre a lista')
  })
})

describe('variações controladas', () => {
  it('altera um campo por caso e monta o par da duplicidade', () => {
    const plan = planVariations({
      baseText: '{"nome":"Ana","cidade":"Recife"}',
      fields: ['nome', 'cidade'],
      changes: ['vazio', 'duplicidade'],
      onePerCase: true,
      limit: 10,
    })
    expect(plan.cases).toHaveLength(4)
    expect(JSON.parse(plan.cases[0].inputs.find((input) => input.key === 'variacao')?.value || '')).toEqual({ nome: '', cidade: 'Recife' })
    expect(JSON.parse(plan.cases[1].inputs.find((input) => input.key === 'variacao')?.value || '')).toEqual({ nome: 'Ana', cidade: '' })
    expect(plan.cases.slice(2).map((item) => item.inputs.find((input) => input.key === 'papel')?.value)).toEqual(['Original', 'Duplicado'])
    expect(plan.cases[2].inputs.find((input) => input.key === 'variacao')?.value).toBe(plan.cases[3].inputs.find((input) => input.key === 'variacao')?.value)
  })
})

describe('arquivos por estratégia', () => {
  it('recusa arquivo acima do teto antes de gerar', () => {
    const plan = planFileCombos({
      extensions: ['TXT'],
      selected: [{ extension: 'TXT', condition: 'corrompido' }],
      tam: 2,
      unid: 'GB',
      real: 'PNG',
      nome: 'arquivo_teste',
    })
    expect(plan.cases).toEqual([])
    expect(plan.errors[0]).toMatch(/no máximo 1/)
  })
})

describe('materialização e exportação', () => {
  it('exporta o caso pendente e, com vínculo, o mesmo conjunto ganha valor gerado', () => {
    const plan = planDecision({
      conditions: [{ id: 'c1', name: 'Documento', values: ['presente'] }],
      actions: [{ id: 'a1', name: 'Resultado' }],
      rules: [{ id: 'r1', cells: { c1: 'presente' }, excluded: false, actions: { a1: '' } }],
    })
    const pending = strategyToJson(plan.cases)
    expect(pending).toContain('nao_configurado')
    expect(pending).toContain('A massa concreta ainda não foi configurada.')
    const generated = materialize(plan.cases, [{
      ownerId: 'c1', value: 'presente', field: 'cpf', generator: 'CPF', rule: 'Válido',
    }], rng(4821))
    expect(generated[0].concrete).toBe('gerado')
    expect(generated[0].note).toBe('')
    expect(generated[0].inputs.some((input) => input.key === 'valor_c1' && input.value.includes('.'))).toBe(true)
    const csv = strategyToCsv(generated)
    expect(csv).toContain(generated[0].inputs.find((input) => input.key === 'valor_c1')?.value)
    expect(strategyToJson(generated)).toBe(strategyToJson(generated))
  })
})
