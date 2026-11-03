import { emptyPlan, planCase, type PlannedCase, type StrategyPlan } from './types.ts'

export type PartitionKind = 'valida' | 'invalida'
export type PartitionType = 'numero' | 'texto' | 'data'

export type PartitionClass = {
  id: string
  name: string
  from: string
  to: string
}

export type PartitionConfig = {
  type: PartitionType
  min: string
  max: string
  includeMin: boolean
  includeMax: boolean
  step: string
  validClasses: PartitionClass[]
  invalidClasses: PartitionClass[]
}

export type RulerMark = {
  at: number
  label: string
  kind: 'abaixo' | 'limite' | 'dentro' | 'acima'
}

export type RulerModel = {
  start: number
  end: number
  marks: RulerMark[]
  validFrom: number
  validTo: number
}

export type PartitionResult = {
  plan: StrategyPlan
  ruler: RulerModel | null
}

type Scale = {
  places: number
  parse: (value: string) => number | null
  format: (value: number) => string
  sample: (value: number) => string
}

export function defaultPartitionConfig(): PartitionConfig {
  return {
    type: 'numero',
    min: '0',
    max: '10',
    includeMin: true,
    includeMax: true,
    step: '1',
    validClasses: [],
    invalidClasses: [],
  }
}

export function planPartitions(config: PartitionConfig): PartitionResult {
  const scale = scaleOf(config)
  if (!scale) return { plan: emptyPlan(['O tipo de dado não é reconhecido.']), ruler: null }
  const min = scale.parse(config.min)
  const max = scale.parse(config.max)
  const step = Number(String(config.step).trim().replace(',', '.'))
  const errors: string[] = []
  if (min === null) errors.push('O mínimo não está no formato do tipo escolhido.')
  if (max === null) errors.push('O máximo não está no formato do tipo escolhido.')
  if (!Number.isFinite(step) || step <= 0) errors.push('O passo precisa ser um número maior que zero.')
  if (config.type !== 'numero' && (!Number.isInteger(step) || step < 1)) {
    errors.push(config.type === 'texto' ? 'O passo do texto é um número inteiro de caracteres, a partir de 1.' : 'O passo da data é um número inteiro de dias, a partir de 1.')
  }
  if (errors.length || min === null || max === null) return { plan: emptyPlan(errors), ruler: null }
  if (min > max) return { plan: emptyPlan(['O mínimo está acima do máximo.']), ruler: null }

  const places = config.type === 'numero' ? decimalPlaces(step) : 0
  const lower = config.includeMin ? min : min + step
  const upper = config.includeMax ? max : max - step
  if (lower > upper) {
    return { plan: emptyPlan(['O intervalo válido ficou vazio com os limites excluídos.']), ruler: null }
  }
  if (config.type === 'texto' && min > 0 && min - step < 0) {
    return { plan: emptyPlan([`O passo ${formatNumber(step, 0)} passa do comprimento mínimo ${formatNumber(min, 0)}. Não há valor abaixo sem reduzir o passo.`]), ruler: null }
  }

  const points: { value: number; point: string; rule: string; kind: RulerMark['kind']; mark: boolean }[] = []
  if (!(config.type === 'texto' && min === 0)) {
    points.push({ value: min - step, point: 'Abaixo do mínimo', rule: `Abaixo do mínimo ${scale.format(min)}.`, kind: 'abaixo', mark: true })
  }
  points.push(
    {
      value: min,
      point: 'Limite mínimo',
      rule: config.includeMin ? `Limite mínimo ${scale.format(min)} incluído.` : `Limite mínimo ${scale.format(min)} excluído.`,
      kind: 'limite',
      mark: true,
    },
    { value: representative(min, lower, upper, step), point: 'Representante', rule: 'Representante da partição válida.', kind: 'dentro', mark: true },
    {
      value: max,
      point: 'Limite máximo',
      rule: config.includeMax ? `Limite máximo ${scale.format(max)} incluído.` : `Limite máximo ${scale.format(max)} excluído.`,
      kind: 'limite',
      mark: true,
    },
    { value: max + step, point: 'Acima do máximo', rule: `Acima do máximo ${scale.format(max)}.`, kind: 'acima', mark: true },
  )

  const classes = [
    ...config.validClasses.map((item) => ({ ...item, kind: 'valida' as const })),
    ...config.invalidClasses.map((item) => ({ ...item, kind: 'invalida' as const })),
  ]
  for (const item of classes) {
    const name = item.name.trim()
    const from = scale.parse(item.from)
    const to = scale.parse(item.to)
    if (!name) {
      errors.push('Toda classe precisa de um nome.')
      continue
    }
    if (from === null || to === null) {
      errors.push(`A classe ${name} está fora do formato do tipo escolhido.`)
      continue
    }
    if (from > to) {
      errors.push(`Na classe ${name}, o início está acima do fim.`)
      continue
    }
    points.push({
      value: representative(from, from, to, step),
      point: name,
      rule: item.kind === 'invalida'
        ? `Classe inválida ${name}: de ${scale.format(from)} a ${scale.format(to)}.`
        : `Representante da classe válida ${name}.`,
      kind: 'dentro',
      mark: false,
    })
  }
  if (errors.length) return { plan: emptyPlan(errors), ruler: null }

  const cases: PlannedCase[] = points.map((point, index) => planCase(index + 1, [
    { key: 'valor', label: 'Valor', value: scale.sample(roundTo(point.value, places)) },
    { key: 'ponto', label: 'Ponto', value: point.point },
  ], point.rule, '', false))

  const marks = points.filter((point) => point.mark).map((point) => ({
    at: point.value,
    label: scale.format(roundTo(point.value, places)),
    kind: point.kind,
  }))
  return {
    plan: {
      cases,
      possible: cases.length,
      excluded: 0,
      generated: cases.length,
      detail: config.type === 'texto' && min === 0 ? 'Comprimento 0 não tem valor abaixo.' : undefined,
      errors: [],
    },
    ruler: {
      start: config.type === 'texto' && min === 0 ? min : min - step,
      end: max + step,
      marks,
      validFrom: lower,
      validTo: upper,
    },
  }
}

function representative(origin: number, lower: number, upper: number, step: number) {
  const mid = (lower + upper) / 2
  const snapped = origin + Math.round((mid - origin) / step) * step
  if (snapped < lower) return lower
  if (snapped > upper) return upper
  return snapped
}

function roundTo(value: number, places: number) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatNumber(value: number, places: number) {
  const rounded = roundTo(value, places)
  if (places === 0) return String(rounded)
  return rounded.toFixed(places).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function decimalPlaces(step: number) {
  const text = String(step)
  const index = text.indexOf('.')
  return index < 0 ? 0 : text.length - index - 1
}

function scaleOf(config: PartitionConfig): Scale | null {
  if (config.type === 'numero') {
    const step = Number(String(config.step).trim().replace(',', '.'))
    const places = Number.isFinite(step) ? decimalPlaces(step) : 0
    return {
      places,
      parse: (value) => {
        const number = Number(String(value).trim().replace(',', '.'))
        return Number.isFinite(number) ? number : null
      },
      format: (value) => formatNumber(value, places),
      sample: (value) => formatNumber(value, places),
    }
  }
  if (config.type === 'texto') {
    return {
      places: 0,
      parse: (value) => {
        const number = Number(String(value).trim())
        return Number.isInteger(number) && number >= 0 ? number : null
      },
      format: (value) => String(value),
      sample: (value) => sampleText(value),
    }
  }
  if (config.type === 'data') {
    return {
      places: 0,
      parse: (value) => {
        const date = parseDate(value)
        return date ? Math.round(date.getTime() / 86_400_000) : null
      },
      format: (value) => formatDate(value),
      sample: (value) => formatDate(value),
    }
  }
  return null
}

function sampleText(length: number) {
  const alphabet = 'massa de teste '
  let text = ''
  while (text.length < length) text += alphabet
  return text.slice(0, length)
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1) return null
  return date
}

function formatDate(days: number) {
  const date = new Date(days * 86_400_000)
  return date.toISOString().slice(0, 10)
}
