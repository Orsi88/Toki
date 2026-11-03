import { luhn } from './finance.ts'
import { cnpjValid, cpfValid, parseBirth } from './people.ts'
import { detectDelimiter, splitCsv } from './structured.ts'
import { bad, emptyInput, ok, plural, verdict, warn, type Check, type Outcome } from './verdict.ts'

// Perfil de uma massa (CSV ou JSON): cada coluna vira um veredito com tipo provável, vazios, repetidos e inválidos.

type Kind = { name: string; test: (value: string) => boolean; valid?: (value: string) => boolean }

const KINDS: Kind[] = [
  { name: 'CPF', test: (value) => /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(value), valid: cpfValid },
  { name: 'CNPJ', test: (value) => /^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}$/i.test(value), valid: cnpjValid },
  { name: 'E-mail', test: (value) => value.includes('@'), valid: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) },
  { name: 'CEP', test: (value) => /^\d{5}-?\d{3}$/.test(value) },
  { name: 'Telefone', test: (value) => /^(\+?55)?\s*\(?\d{2}\)?\s*9?\d{4}-?\d{4}$/.test(value) },
  { name: 'Data', test: (value) => /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(value), valid: (value) => parseBirth(value.slice(0, 10))?.exists ?? true },
  { name: 'Cartão', test: (value) => /^(\d[\s-]?){13,19}$/.test(value), valid: (value) => luhn(value.replace(/\D/g, '')) },
  { name: 'Booleano', test: (value) => /^(true|false|sim|não|nao|0|1)$/i.test(value) },
  { name: 'Número', test: (value) => /^-?(\d{1,3}(\.\d{3})*|\d+)(,\d+)?$|^-?\d+(\.\d+)?$/.test(value) },
  { name: 'UUID', test: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) },
]

function table(text: string): { columns: string[]; rows: string[][] } | string {
  const trimmed = text.trim()
  if (/^[[{]/.test(trimmed)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (error) {
      return `JSON inválido: ${error instanceof Error ? error.message : 'não foi possível ler'}.`
    }
    const list = Array.isArray(parsed) ? parsed : [parsed]
    if (!list.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return 'O JSON precisa ser uma lista de objetos.'
    const columns = [...new Set(list.flatMap((item) => Object.keys(item as object)))]
    return { columns, rows: list.map((item) => columns.map((column) => { const value = (item as Record<string, unknown>)[column]; return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value) })) }
  }
  const { rows, openQuote } = splitCsv(trimmed.replace(/^\ufeff/, ''), detectDelimiter(trimmed))
  if (openQuote >= 0) return 'CSV com aspas abertas e não fechadas.'
  if (rows.length < 2) return 'O CSV precisa de cabeçalho e ao menos uma linha.'
  return { columns: rows[0].map((cell, index) => cell.trim() || `coluna_${index + 1}`), rows: rows.slice(1) }
}

export function profileDataset(text: string): Outcome {
  if (!text.trim()) return emptyInput('Cole a massa em CSV ou JSON, ou envie o arquivo.')
  const parsed = table(text)
  if (typeof parsed === 'string') return { verdicts: [], error: parsed }
  const { columns, rows } = parsed
  const summary: Check[] = [ok('Registros', `${plural(rows.length, 'registro', 'registros')} e ${plural(columns.length, 'coluna', 'colunas')}.`)]
  const uneven = rows.filter((row) => row.length !== columns.length).length
  if (uneven) summary.push(bad('Colunas', `${plural(uneven, 'linha tem', 'linhas têm')} quantidade de colunas diferente do cabeçalho.`))
  const whole = new Map<string, number>()
  for (const row of rows) whole.set(row.join('\u0001'), (whole.get(row.join('\u0001')) ?? 0) + 1)
  const duplicated = [...whole.values()].filter((count) => count > 1).reduce((total, count) => total + count - 1, 0)
  if (duplicated) summary.push(warn('Registros repetidos', `${plural(duplicated, 'registro idêntico', 'registros idênticos')} a outro.`))
  const verdicts = [verdict('Massa inteira', summary, { ok: 'Massa consistente', bad: 'Massa com problema', warn: 'Massa com alertas' })]
  columns.forEach((column, index) => {
    const values = rows.map((row) => (row[index] ?? '').trim())
    const filled = values.filter(Boolean)
    const checks: Check[] = []
    const empty = values.length - filled.length
    checks.push(empty ? (empty === values.length ? bad('Preenchimento', 'Coluna toda vazia.') : warn('Preenchimento', `${plural(empty, 'vazio', 'vazios')} em ${values.length}.`)) : ok('Preenchimento', 'Nenhum vazio.'))
    const kind = KINDS.find((item) => filled.length > 0 && filled.filter(item.test).length / filled.length >= 0.8)
    if (kind) {
      const odd = filled.filter((value) => !kind.test(value)).length
      checks.push(odd ? warn('Tipo', `${kind.name} em ${filled.length - odd} de ${filled.length}; ${plural(odd, 'valor foge', 'valores fogem')} do formato.`) : ok('Tipo', `${kind.name}.`))
      if (kind.valid) {
        const invalid = filled.filter((value) => kind.test(value) && !kind.valid!(value))
        if (invalid.length) checks.push(bad('Validade', `${plural(invalid.length, `${kind.name} inválido`, `${kind.name}s inválidos`)} (ex.: ${invalid[0]}).`))
        else checks.push(ok('Validade', `Todos os ${kind.name} conferem.`))
      }
    } else checks.push(ok('Tipo', filled.length ? 'Texto livre.' : 'Sem valores.'))
    const unique = new Set(filled).size
    const repeated = filled.length - unique
    if (/(^|_)(id|cpf|cnpj|email|e_mail|codigo|code|uuid)($|_)/i.test(column) && repeated) checks.push(bad('Unicidade', `${plural(repeated, 'valor repetido', 'valores repetidos')} numa coluna que parece chave.`))
    else checks.push(ok('Distintos', `${unique} de ${filled.length}.`))
    const lengths = filled.map((value) => Array.from(value).length)
    if (lengths.length) checks.push(ok('Comprimento', `de ${Math.min(...lengths)} a ${Math.max(...lengths)} caracteres.`))
    if (filled.some((value) => /^[=+\-@]\s*\w+\(/.test(value))) checks.push(warn('Fórmula', 'Valor que começa com = + - @: o Excel executa como fórmula (CSV injection).'))
    verdicts.push(verdict(column, checks, { ok: 'Coluna consistente', bad: 'Coluna com problema', warn: 'Coluna com alertas' }))
  })
  return { verdicts }
}
