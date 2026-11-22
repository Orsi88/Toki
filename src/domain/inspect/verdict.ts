// Formato comum da aba Validar: cada entrada vira uma ficha de PROPRIEDADES. A aba não julga se o dado tem
// problema; só conferências com cálculo (dígitos verificadores, Luhn, CRC, EAN/UPC) dizem válido ou inválido.

export type Tone = 'ok' | 'bad' | 'warn'
export type Check = { label: string; tone: Tone; detail: string; calc?: boolean }
/** calc: resultado do cálculo (ou da portaria simulada dos eventos do Toki); undefined quando só há propriedades. */
export type Verdict = { input: string; title: string; tone: Tone; summary: string; checks: Check[]; calc?: string }

// Conferências que são conta (algoritmo verificável), não regra de negócio.
export const CALC_LABELS = new Set(['Dígitos verificadores', 'Luhn', 'CRC16', 'DV geral', 'EAN-13', 'EAN-8', 'UPC-A'])
export type Labels = { ok: string; bad: string; warn: string }
export type Outcome = { verdicts: Verdict[]; error?: string }

export const VALID: Labels = { ok: 'Válido', bad: 'Inválido', warn: 'Válido com ressalva' }

export function ok(label: string, detail: string): Check {
  return { label, tone: 'ok', detail }
}

export function bad(label: string, detail: string): Check {
  return { label, tone: 'bad', detail }
}

export function warn(label: string, detail: string): Check {
  return { label, tone: 'warn', detail }
}

// Portaria simulada dos eventos gerados pelo Toki (assinatura do QR + regras do próprio evento): ali
// "liberada/barrada" é o resultado da conta. Nenhum outro validador usa esta função.
export function portaria(input: string, checks: Check[], labels: Labels): Verdict {
  const tone: Tone = checks.some((check) => check.tone === 'bad') ? 'bad' : checks.some((check) => check.tone === 'warn') ? 'warn' : 'ok'
  return { input, title: labels[tone], tone, summary: '', checks, calc: labels[tone] }
}

// Ficha de propriedades. O terceiro argumento é ignorado de propósito: rótulos de veredito não valem aqui.
export function verdict(input: string, checks: Check[], _labels?: Labels): Verdict {
  const marked = checks.map((check) => (CALC_LABELS.has(check.label) ? { ...check, calc: true } : check))
  const calcs = marked.filter((check) => check.calc)
  const calc = calcs.length ? (calcs.some((check) => check.tone !== 'ok') ? 'Inválido' : 'Válido') : undefined
  return {
    input,
    title: calc ?? 'Propriedades',
    tone: calc === 'Inválido' ? 'bad' : 'ok',
    summary: '',
    checks: marked,
    calc,
  }
}

export function lines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function emptyInput(message = 'Cole ao menos um valor, um por linha.'): Outcome {
  return { verdicts: [], error: message }
}

export const pad2 = (value: number) => String(value).padStart(2, '0')

export function fmtDate(date: Date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`
}
