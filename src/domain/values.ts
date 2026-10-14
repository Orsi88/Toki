export type Rgb = { r: number; g: number; b: number; a: number }

const LENGTH = ['mm', 'cm', 'm'] as const
const MASS = ['g', 'kg'] as const
const VOLUME = ['ml', 'L'] as const

const TO_BASE: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  g: 0.001,
  kg: 1,
  ml: 0.001,
  L: 1,
}

export function unitsFor(kind: string): string[] {
  if (kind === 'Comprimento') return [...LENGTH]
  if (kind === 'Massa') return [...MASS]
  if (kind === 'Volume') return [...VOLUME]
  return []
}

export function isMeasure(kind: string) {
  return unitsFor(kind).length > 0
}

export function isColor(kind: string) {
  return kind === 'Cor'
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function parseColor(input: string): Rgb | null {
  const text = input.trim()
  const hex = text.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1]
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i)
  if (!rgb) return null
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  if (channels.some((channel) => channel > 255)) return null
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
  if (alpha < 0 || alpha > 1) return null
  return { r: channels[0], g: channels[1], b: channels[2], a: alpha }
}

export function randomRgb(random: () => number): Rgb {
  return {
    r: Math.floor(random() * 256),
    g: Math.floor(random() * 256),
    b: Math.floor(random() * 256),
    a: 1,
  }
}

function hexByte(value: number) {
  return clampByte(value).toString(16).padStart(2, '0')
}

export function formatColor(color: Rgb, representation: string, alphaPercent = 100) {
  if (representation === 'RGB') return `rgb(${color.r}, ${color.g}, ${color.b})`
  if (representation === 'RGBA') {
    const alpha = Math.max(0, Math.min(100, Number(alphaPercent) || 0)) / 100
    const shown = Number(alpha.toFixed(2))
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${shown})`
  }
  return `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`
}

export type ColorResult = {
  value: string
  base: string
  tag: string
  tone: string
  rule: string
  why: string
}

export function colorValue(options: {
  representation: string
  origin: string
  baseText: string
  alpha: number
  rule: string
  random: () => number
}): ColorResult | { error: string } {
  const rule = options.rule || 'Válida'
  if (rule === 'HEX inválido') {
    return {
      value: '#12GG99',
      base: '—',
      tag: 'HEX inválido',
      tone: 'bad',
      rule: 'hex_invalido',
      why: '#12GG99 não é um HEX de 6 dígitos.',
    }
  }
  if (rule === 'Canal fora do intervalo') {
    return {
      value: 'rgb(300, 10, 10)',
      base: '300, 10, 10',
      tag: 'canal fora do intervalo',
      tone: 'bad',
      rule: 'canal_fora',
      why: 'O canal vermelho 300 está fora de 0 a 255.',
    }
  }
  const color = options.origin === 'Informada' ? parseColor(options.baseText) : randomRgb(options.random)
  if (!color) {
    return { error: 'A cor informada precisa ser #RRGGBB, rgb() ou rgba() com canais de 0 a 255.' }
  }
  const representation = options.representation || 'HEX'
  return {
    value: formatColor(color, representation, options.alpha),
    base: `${color.r}, ${color.g}, ${color.b}`,
    tag: 'cor válida',
    tone: 'ok',
    rule: 'cor_valida',
    why: `A mesma base ${color.r}, ${color.g}, ${color.b} formatada como ${representation}.`,
  }
}

export function colorCell(random: () => number, bad: boolean, representation = 'HEX', alpha = 100) {
  if (bad) return random() < 0.5 ? '#12GG99' : 'rgb(300, 0, 0)'
  return formatColor(randomRgb(random), representation, alpha)
}

function decimals(value: number) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) return null
  return parsed
}

export function formatMeasure(value: number, places: number, comma: boolean) {
  const text = value.toFixed(places)
  return comma ? text.replace('.', ',') : text
}

export type MeasureRow = {
  value: string
  raw: number
  unit: string
  converted: string
  note: string
  tag: string
  tone: string
  rule: string
  why: string
}

export function measureValue(options: {
  kind: string
  unit: string
  convertTo: string
  min: number
  max: number
  places: number
  comma: boolean
  rule: string
  random: () => number
}): MeasureRow | { error: string } {
  const units = unitsFor(options.kind)
  if (!units.includes(options.unit as 'mm')) {
    return { error: `A unidade ${options.unit || 'vazia'} não pertence a ${options.kind.toLowerCase()}.` }
  }
  const places = decimals(options.places)
  if (places === null) return { error: 'As casas decimais precisam ser um inteiro de 0 a 6.' }
  if (!Number.isFinite(options.min) || !Number.isFinite(options.max)) {
    return { error: 'Mínimo e máximo precisam ser números.' }
  }
  if (options.min > options.max) return { error: 'O mínimo está acima do máximo.' }
  const lo = options.min
  const hi = options.max
  const span = hi - lo
  const rule = options.rule || 'Aleatório no intervalo'
  let raw = lo + options.random() * (span || 0)
  let tag = 'dentro do intervalo'
  let tone = 'ok'
  let key = 'dentro_do_intervalo'
  let why = `${raw} ${options.unit} está entre ${lo} e ${hi}.`
  if (rule === 'Abaixo do mínimo') {
    raw = lo - (span || 1) * (0.1 + options.random())
    tag = 'fora · abaixo do mínimo'
    tone = 'bad'
    key = 'abaixo_do_minimo'
    why = `${raw} ${options.unit} é menor que o mínimo ${lo}. O sinal negativo só é inválido se a regra pedir.`
  } else if (rule === 'Acima do máximo') {
    raw = hi + (span || 1) * (0.1 + options.random())
    tag = 'fora · acima do máximo'
    tone = 'bad'
    key = 'acima_do_maximo'
    why = `${raw} ${options.unit} é maior que o máximo ${hi}.`
  } else if (rule === 'Valores repetidos') {
    raw = lo + (span || 0) / 2
    tag = 'valor repetido'
    tone = 'neu'
    key = 'repetido'
    why = `${raw} ${options.unit} se repete de propósito.`
  }
  const rounded = Number(raw.toFixed(places))
  const target = options.convertTo && options.convertTo !== 'Não converter' ? options.convertTo : ''
  let converted = ''
  let note = 'Sem conversão.'
  if (target) {
    if (!units.includes(target as 'mm')) {
      return { error: `${target} não é unidade de ${options.kind.toLowerCase()}.` }
    }
    const exact = rounded * TO_BASE[options.unit] / TO_BASE[target]
    const shown = Number(exact.toFixed(places))
    converted = `${formatMeasure(shown, places, options.comma)} ${target}`
    note = Math.abs(exact - shown) > 10 ** (-(places + 3))
      ? `Arredondado de ${exact} para ${formatMeasure(shown, places, options.comma)} ${target}. O valor físico é o mesmo.`
      : `Conversão exata para ${target}. O valor físico é o mesmo.`
  }
  return {
    value: `${formatMeasure(rounded, places, options.comma)} ${options.unit}`,
    raw: rounded,
    unit: options.unit,
    converted,
    note,
    tag,
    tone,
    rule: key,
    why: target ? `${why} ${note}` : why,
  }
}

export function measureCell(
  kind: string,
  random: () => number,
  bad: boolean,
  extra?: { unit?: string; min?: number; max?: number },
) {
  const unit = extra?.unit && unitsFor(kind).includes(extra.unit as 'mm') ? extra.unit : unitsFor(kind)[0]
  const min = Number.isFinite(extra?.min) ? Number(extra?.min) : 1
  const max = Number.isFinite(extra?.max) ? Number(extra?.max) : 100
  if (bad) return random() < 0.5 ? '' : 'abc'
  const row = measureValue({
    kind,
    unit,
    convertTo: 'Não converter',
    min,
    max,
    places: 2,
    comma: true,
    rule: 'Aleatório no intervalo',
    random,
  })
  return 'error' in row ? '' : row.value
}

const SKU_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function skuValue(random: () => number, length: number) {
  const size = Math.max(1, Math.min(32, length))
  let body = ''
  for (let index = 0; index < size; index += 1) {
    body += SKU_ALPHABET[Math.floor(random() * SKU_ALPHABET.length)]
  }
  return body
}

export function descriptionValue(random: () => number, size: string) {
  const sentences = [
    'Produto de teste para carga de catálogo.',
    'Embalagem fictícia, sem estoque real.',
    'Descrição usada só para validar limite de texto.',
    'Item sintético do gerador MassForge.',
  ]
  const target = size === 'Extensa' ? 8 : size === 'Curta' ? 1 : 3
  const parts: string[] = []
  for (let index = 0; index < target; index += 1) {
    parts.push(sentences[Math.floor(random() * sentences.length)])
  }
  return parts.join(' ')
}
