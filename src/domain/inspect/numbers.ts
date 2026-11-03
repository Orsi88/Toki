import { parseColor } from '../values.ts'
import { bad, emptyInput, lines, ok, verdict, warn, type Check, type Outcome } from './verdict.ts'

export const NUMBER_STYLES = ['Detectar', 'Brasileiro 1.234,56', 'Internacional 1,234.56']

export type NumberOptions = { estilo: string; min: string; max: string; casas: string; inteiro: boolean }

function readNumber(raw: string, style: string): { value: number; note: string } | string {
  let text = raw.replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '')
  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(text)) return { value: Number(text), note: 'notação científica' }
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-')
  text = text.replace(/^[(+-]|\)$/g, '')
  if (!/^[\d.,]+$/.test(text)) return 'Tem caracteres que não são dígitos, ponto ou vírgula.'
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  let decimal = style.startsWith('Brasileiro') ? ',' : style.startsWith('Internacional') ? '.' : ''
  if (!decimal) {
    if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.'
    else if (lastComma >= 0) decimal = text.split(',').length === 2 && text.length - lastComma - 1 !== 3 ? ',' : text.split(',').length > 2 ? '.' : ','
    else if (lastDot >= 0) decimal = text.split('.').length > 2 || (text.length - lastDot - 1 === 3 && text.split('.')[0].length <= 3 && !text.startsWith('0')) ? ',' : '.'
    else decimal = ','
  }
  const thousands = decimal === ',' ? '.' : ','
  const [whole, fraction, extra] = text.split(decimal)
  if (extra !== undefined) return `Mais de um separador decimal (${decimal}).`
  if (whole.includes(thousands) && !new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+$`).test(whole)) return `Separador de milhar (${thousands}) fora dos grupos de 3 dígitos.`
  if (fraction?.includes(thousands)) return `Separador de milhar (${thousands}) depois da vírgula decimal.`
  const value = Number(`${whole.split(thousands).join('')}${fraction !== undefined ? `.${fraction}` : ''}`)
  if (!Number.isFinite(value)) return 'Não é um número.'
  return { value: negative ? -value : value, note: `decimal "${decimal}"${whole.includes(thousands) ? `, milhar "${thousands}"` : ''}` }
}

function numberChecks(raw: string, options: NumberOptions): Check[] {
  if (/^(#|rgba?\()/i.test(raw.trim())) {
    const color = parseColor(raw.trim())
    return color ? [ok('Cor', `R ${color.r}, G ${color.g}, B ${color.b}${color.a < 1 ? `, alfa ${Math.round(color.a * 100)}%` : ''}.`)] : [bad('Cor', 'Não é #RRGGBB, #RGB, rgb() ou rgba() com canais de 0 a 255.')]
  }
  const parsed = readNumber(raw, options.estilo)
  if (typeof parsed === 'string') return [bad('Número', parsed)]
  const { value, note } = parsed
  const checks: Check[] = [ok('Número', `${value.toLocaleString('pt-BR', { maximumFractionDigits: 10 })} (${note}).`)]
  if (/^R\$/i.test(raw.trim())) checks.push(ok('Tipo', 'Monetário.'))
  if (/%$/.test(raw.trim())) checks.push(value > 100 || value < 0 ? warn('Porcentagem', 'Fora de 0% a 100%.') : ok('Tipo', 'Porcentagem.'))
  const fraction = /[.,](\d+)$/.exec(raw.replace(/%$/, '').trim())
  const places = Number.isInteger(value) && !fraction ? 0 : (String(value).split('.')[1] ?? '').length
  if (options.inteiro && !Number.isInteger(value)) checks.push(bad('Inteiro', 'Tem parte decimal.'))
  if (options.casas !== '' && Number.isFinite(Number(options.casas)) && places > Number(options.casas)) checks.push(bad('Casas decimais', `${places} casas; o limite é ${options.casas}.`))
  const min = options.min.trim() === '' ? null : Number(options.min.replace(',', '.'))
  const max = options.max.trim() === '' ? null : Number(options.max.replace(',', '.'))
  if (min !== null && value < min) checks.push(bad('Intervalo', `Abaixo do mínimo ${min.toLocaleString('pt-BR')}.`))
  else if (max !== null && value > max) checks.push(bad('Intervalo', `Acima do máximo ${max.toLocaleString('pt-BR')}.`))
  else if (min !== null && value === min) checks.push(warn('Intervalo', 'Igual ao mínimo: fronteira.'))
  else if (max !== null && value === max) checks.push(warn('Intervalo', 'Igual ao máximo: fronteira.'))
  else if (min !== null || max !== null) checks.push(ok('Intervalo', 'Dentro do intervalo.'))
  if (Object.is(value, -0) || (value === 0 && raw.trim().startsWith('-'))) checks.push(warn('Zero negativo', '-0 pode ser gravado diferente de 0.'))
  if (Number.isInteger(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER) checks.push(bad('Precisão', 'Passa de 9.007.199.254.740.991: JavaScript e JSON perdem dígitos.'))
  else if (Number.isInteger(value) && (value > 2147483647 || value < -2147483648)) checks.push(warn('32 bits', 'Não cabe num inteiro de 32 bits (int).'))
  if (/^-?0\d/.test(raw.trim().replace(/^R\$\s*/i, ''))) checks.push(warn('Zero à esquerda', 'Começa com zero: alguns sistemas leem como octal ou removem o zero.'))
  return checks
}

export function validateNumbers(text: string, options: NumberOptions): Outcome {
  const items = lines(text)
  if (!items.length) return emptyInput()
  return { verdicts: items.map((item) => verdict(item, numberChecks(item, options), { ok: 'Número válido', bad: 'Número inválido', warn: 'Número com ressalva' })) }
}
