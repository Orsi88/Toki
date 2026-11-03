// Formato comum da aba Validar: cada entrada vira um veredito com a lista do que foi conferido.

export type Tone = 'ok' | 'bad' | 'warn'
export type Check = { label: string; tone: Tone; detail: string }
export type Verdict = { input: string; title: string; tone: Tone; summary: string; checks: Check[] }
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

export function verdict(input: string, checks: Check[], labels: Labels = VALID): Verdict {
  const tone: Tone = checks.some((check) => check.tone === 'bad') ? 'bad' : checks.some((check) => check.tone === 'warn') ? 'warn' : 'ok'
  const failed = checks.filter((check) => check.tone === tone && tone !== 'ok').map((check) => check.label.toLocaleLowerCase('pt-BR'))
  return {
    input,
    title: labels[tone],
    tone,
    summary: tone === 'ok' ? 'Todas as conferências passaram.' : `${tone === 'bad' ? 'Falhou em' : 'Atenção em'}: ${failed.join(', ')}.`,
    checks,
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
