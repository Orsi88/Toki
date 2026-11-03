import { bad, emptyInput, lines, ok, plural, verdict, warn, type Check, type Outcome } from './verdict.ts'

// Contagens que costumam divergir entre front, API e banco, e os caracteres que quebram sistemas.

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null
const INVISIBLE = /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\ufeff\u00ad]/g
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const EMOJI = /\p{Extended_Pictographic}/gu
const INJECTION: [string, RegExp][] = [
  ['SQL', /('|")\s*(or|and)\s+('|"|\d)|;\s*(drop|delete|update|insert)\b|--\s*$|\bunion\s+select\b/i],
  ['HTML/XSS', /<\s*(script|img|svg|iframe)\b|javascript:|\bon[a-z]+\s*=/i],
  ['Caminho', /\.\.[\\/]|%2e%2e%2f/i],
  ['Quebra de cabeçalho', /%0d%0a|\r\n(?=[\w-]+:)/i],
  ['Template', /\{\{.*\}\}|\$\{.*\}/],
  ['Fórmula de planilha', /^[=+\-@]\s*\w+\(/],
]

export type TextLimits = { min: string; max: string; unidade: string }

export function graphemes(text: string) {
  return segmenter ? [...segmenter.segment(text)].length : Array.from(text).length
}

function scripts(text: string) {
  const found = new Set<string>()
  for (const [name, pattern] of [['latino', /\p{Script=Latin}/u], ['cirílico', /\p{Script=Cyrillic}/u], ['grego', /\p{Script=Greek}/u], ['árabe', /\p{Script=Arabic}/u], ['hebraico', /\p{Script=Hebrew}/u], ['chinês/japonês', /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u], ['coreano', /\p{Script=Hangul}/u], ['devanágari', /\p{Script=Devanagari}/u]] as const) {
    if (pattern.test(text)) found.add(name)
  }
  return [...found]
}

function sizeIn(text: string, unit: string) {
  if (unit === 'Bytes UTF-8') return new TextEncoder().encode(text).length
  if (unit === 'Unidades UTF-16') return text.length
  if (unit === 'Caracteres visíveis') return graphemes(text)
  return Array.from(text).length
}

function limitCheck(text: string, limits: TextLimits): Check[] {
  const unit = limits.unidade || 'Caracteres'
  const size = sizeIn(text, unit)
  const min = limits.min.trim() === '' ? null : Number(limits.min)
  const max = limits.max.trim() === '' ? null : Number(limits.max)
  if (min === null && max === null) return []
  const what = unit.toLocaleLowerCase('pt-BR')
  if (max !== null && size > max) return [bad('Limite', `${size} ${what}: passa do máximo ${max} em ${size - max}.`)]
  if (min !== null && size < min) return [bad('Limite', `${size} ${what}: abaixo do mínimo ${min}.`)]
  if (size === max || size === min) return [warn('Limite', `${size} ${what}: exatamente no limite.`)]
  return [ok('Limite', `${size} ${what}: dentro de ${min ?? 0} a ${max ?? '∞'}.`)]
}

export function textChecks(text: string, limits: TextLimits, detailed = true): Check[] {
  const points = Array.from(text).length
  const visible = graphemes(text)
  const bytes = new TextEncoder().encode(text).length
  const checks: Check[] = []
  checks.push(ok('Tamanho', `${plural(points, 'caractere', 'caracteres')} · ${plural(visible, 'visível', 'visíveis')} · ${plural(text.length, 'unidade UTF-16', 'unidades UTF-16')} · ${plural(bytes, 'byte', 'bytes')} em UTF-8.`))
  if (points !== visible) checks.push(warn('Contagem', `O que se vê (${visible}) difere dos caracteres (${points}): emojis compostos e acentos combinados contam mais de um.`))
  if (text.length !== points) checks.push(warn('UTF-16', `JavaScript e SQL Server contam ${text.length}, não ${points}: há caracteres fora do plano básico (emoji, símbolo matemático).`))
  checks.push(...limitCheck(text, limits))
  if (detailed) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const rows = text ? text.split(/\r\n|\r|\n/).length : 0
    checks.push(ok('Palavras e linhas', `${plural(words, 'palavra', 'palavras')} em ${plural(rows, 'linha', 'linhas')}.`))
  }
  if (!text.trim()) checks.push(warn('Vazio', text ? 'Só espaços em branco.' : 'Texto vazio.'))
  if (/^\s|\s$/.test(text) && text.trim()) checks.push(warn('Espaços', 'Espaço nas pontas: costuma ser cortado (trim) por um lado e não pelo outro.'))
  if (/ {2,}/.test(text)) checks.push(warn('Espaços', 'Espaços duplos.'))
  if (/\u00a0/.test(text)) checks.push(warn('Espaços', 'Espaço não separável (NBSP), que parece espaço comum mas não é.'))
  const invisible = text.match(INVISIBLE) ?? []
  if (invisible.length) checks.push(bad('Invisíveis', `${plural(invisible.length, 'caractere invisível', 'caracteres invisíveis')} (${[...new Set(invisible.map((char) => `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`))].join(', ')}).${/[\u202a-\u202e]/.test(text) ? ' Inclui controle de direção, que inverte o texto exibido.' : ''}`))
  const control = text.match(CONTROL) ?? []
  if (control.length) checks.push(bad('Controle', `${plural(control.length, 'caractere de controle', 'caracteres de controle')}, que bancos e XML costumam recusar.`))
  if (/\r\n/.test(text) && /(^|[^\r])\n/.test(text)) checks.push(warn('Quebras', 'Mistura quebras CRLF e LF.'))
  if (text.normalize('NFC') !== text) checks.push(warn('Normalização', 'Acentos decompostos (NFD): "é" pode não ser igual a "é" numa busca ou comparação.'))
  const accents = text.normalize('NFD').match(/[\u0300-\u036f]/g)?.length ?? 0
  if (accents) checks.push(ok('Acentos', `${plural(accents, 'acento', 'acentos')}: confira se o sistema grava em UTF-8.`))
  const emojis = text.match(EMOJI)?.length ?? 0
  if (emojis) checks.push(warn('Emojis', `${plural(emojis, 'emoji', 'emojis')}: MySQL com utf8 (sem mb4) recusa ou corta.`))
  const found = scripts(text)
  if (found.length > 1) checks.push(found.includes('latino') && (found.includes('cirílico') || found.includes('grego')) ? bad('Homóglifos', `Mistura alfabeto latino com ${found.filter((name) => name !== 'latino').join(' e ')}: letras iguais na aparência e diferentes no código, truque de phishing.`) : ok('Alfabetos', found.join(', ')))
  else if (found.length === 1 && found[0] !== 'latino') checks.push(ok('Alfabetos', found[0]))
  for (const [name, pattern] of INJECTION) if (pattern.test(text)) checks.push(warn('Injeção', `Padrão de ${name}: o sistema precisa tratar como texto, não executar.`))
  return checks
}

export function validateText(text: string, limits: TextLimits): Outcome {
  if (!text) return emptyInput('Cole o texto a analisar.')
  return { verdicts: [verdict(text.length > 80 ? `${text.slice(0, 80)}…` : text, textChecks(text, limits), { ok: 'Texto sem problemas', bad: 'Texto com problema', warn: 'Texto com alertas' })] }
}

export type EdgeOptions = TextLimits & { valorMin: string; valorMax: string; obrigatorio: boolean; unico: boolean }

// Casos de borda: cada linha é um valor que um campo vai receber.
export function validateEdges(text: string, options: EdgeOptions): Outcome {
  const items = text.split(/\r?\n/)
  if (!text.length) return emptyInput('Cole os valores, um por linha. Linha vazia conta como valor vazio.')
  const seen = new Map<string, number>()
  return {
    verdicts: items.map((item, index) => {
      const checks: Check[] = []
      const empty = !item.trim() || /^(null|undefined|nil|none)$/i.test(item.trim())
      if (empty) checks.push(options.obrigatorio ? bad('Obrigatório', item.trim() ? `"${item.trim()}" escrito como texto, não é valor de verdade.` : 'Vazio num campo obrigatório.') : warn('Vazio', 'Valor vazio ou nulo.'))
      checks.push(...textChecks(item, options, false))
      const number = Number(item.trim().replace(',', '.'))
      if (item.trim() && Number.isFinite(number) && (options.valorMin.trim() || options.valorMax.trim())) {
        const min = options.valorMin.trim() === '' ? null : Number(options.valorMin)
        const max = options.valorMax.trim() === '' ? null : Number(options.valorMax)
        if (min !== null && number < min) checks.push(bad('Valor', `${number} abaixo do mínimo ${min}.`))
        else if (max !== null && number > max) checks.push(bad('Valor', `${number} acima do máximo ${max}.`))
        else if (number === min || number === max) checks.push(warn('Valor', 'Exatamente no limite.'))
        else checks.push(ok('Valor', 'Dentro do intervalo.'))
      }
      if (options.unico && !empty) {
        const key = item.trim().toLocaleLowerCase('pt-BR')
        const before = seen.get(key)
        if (before !== undefined) checks.push(bad('Único', `Repete a linha ${before + 1}${item.trim() !== items[before].trim() ? ' (muda só caixa ou espaços)' : ''}.`))
        else seen.set(key, index)
      }
      return verdict(`${index + 1}: ${item === '' ? '(vazio)' : item}`, checks, { ok: 'Aceito', bad: 'Recusado', warn: 'Aceito com alerta' })
    }),
  }
}

export { lines }
