import { bad, emptyInput, fmtDate, lines, ok, pad2, verdict, warn, type Check, type Outcome } from './verdict.ts'

export const DATE_FORMATS = ['Detectar', 'DD/MM/AAAA', 'MM/DD/AAAA', 'AAAA-MM-DD', 'ISO 8601', 'Timestamp Unix', 'Horário']

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate()

export type DateOptions = { formato: string; min: string; max: string; day: Date }

function timeChecks(h: number, m: number, s: number | undefined): Check[] {
  if (h === 24 && m === 0 && !s) return [warn('Horário', '24:00 é aceito por alguns sistemas como fim do dia; outros recusam.')]
  if (h > 23) return [bad('Horário', `Hora ${h} não existe (0 a 23).`)]
  if (m > 59) return [bad('Horário', `Minuto ${m} não existe (0 a 59).`)]
  if (s !== undefined && s > 59) return [s === 60 ? warn('Horário', 'Segundo 60 só existe em segundo bissexto.') : bad('Horário', `Segundo ${s} não existe (0 a 59).`)]
  return [ok('Horário', `${pad2(h)}:${pad2(m)}${s !== undefined ? `:${pad2(s)}` : ''}.`)]
}

function dayChecks(y: number, m: number, d: number, options: DateOptions): { checks: Check[]; date: Date | null } {
  if (m < 1 || m > 12) return { checks: [bad('Mês', `Mês ${m} não existe.`)], date: null }
  if (d < 1 || d > daysIn(y, m)) {
    const why = m === 2 && d === 29 ? `${y} não é bissexto, então fevereiro tem 28 dias.` : `${pad2(m)}/${y} tem ${daysIn(y, m)} dias.`
    return { checks: [bad('Existe', `${pad2(d)}/${pad2(m)}/${y} não existe: ${why}`)], date: null }
  }
  const date = new Date(y, m - 1, d)
  const checks: Check[] = [ok('Existe', `${fmtDate(date)}, ${WEEKDAYS[date.getDay()]}.`)]
  if (m === 2 && d === 29) checks.push(ok('Bissexto', `29 de fevereiro num ano bissexto (${y}).`))
  const diff = Math.round((date.getTime() - new Date(options.day.getFullYear(), options.day.getMonth(), options.day.getDate()).getTime()) / 864e5)
  checks.push(ok('Referência', diff === 0 ? 'É a data de referência.' : diff < 0 ? `${-diff} dias antes da referência.` : `${diff} dias depois da referência.`))
  if (y < 1900 || y > 2100) checks.push(warn('Ano', `${y} fica fora do intervalo que muitos sistemas aceitam (1900 a 2100).`))
  const min = options.min ? new Date(`${options.min}T00:00:00`) : null
  const max = options.max ? new Date(`${options.max}T00:00:00`) : null
  if (min && date < min) checks.push(bad('Intervalo', `Antes do mínimo ${fmtDate(min)}.`))
  else if (max && date > max) checks.push(bad('Intervalo', `Depois do máximo ${fmtDate(max)}.`))
  else if (min || max) checks.push(ok('Intervalo', 'Dentro do intervalo.'))
  return { checks, date }
}

function parseLine(value: string, formato: string, options: DateOptions): Check[] {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value)
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  const unix = /^-?\d{9,13}$/.test(value)
  const want = formato
  if ((want === 'Detectar' || want === 'Horário') && time) return [ok('Formato', 'Horário.'), ...timeChecks(Number(time[1]), Number(time[2]), time[3] ? Number(time[3]) : undefined)]
  if ((want === 'Detectar' || want === 'Timestamp Unix') && unix) {
    const ms = value.replace('-', '').length >= 12 ? Number(value) : Number(value) * 1000
    const date = new Date(ms)
    const checks = [ok('Formato', `Timestamp Unix em ${value.replace('-', '').length >= 12 ? 'milissegundos' : 'segundos'}.`), ok('Instante', `${fmtDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} (horário local).`)]
    if (Number(value) > 2147483647 && value.length <= 10) checks.push(warn('2038', 'Passa de 2.147.483.647: estoura campos de 32 bits (problema do ano 2038).'))
    if (Number(value) < 0) checks.push(warn('Época', 'Antes de 1970: alguns sistemas não aceitam timestamp negativo.'))
    return checks
  }
  if (iso && (want === 'Detectar' || want === 'AAAA-MM-DD' || want === 'ISO 8601')) {
    const checks: Check[] = [ok('Formato', iso[4] ? 'ISO 8601 com horário.' : 'AAAA-MM-DD.')]
    const result = dayChecks(Number(iso[1]), Number(iso[2]), Number(iso[3]), options)
    checks.push(...result.checks)
    if (iso[4]) checks.push(...timeChecks(Number(iso[4]), Number(iso[5]), iso[6] ? Number(iso[6]) : undefined))
    if (iso[8]) {
      if (iso[8] === 'Z') checks.push(ok('Fuso', 'UTC (Z).'))
      else {
        const hours = Number(iso[8].slice(1, 3))
        const minutes = Number(iso[8].replace(':', '').slice(3))
        const offset = (iso[8][0] === '-' ? -1 : 1) * (hours + minutes / 60)
        checks.push(offset < -12 || offset > 14 || minutes % 15 ? bad('Fuso', `${iso[8]} não é um fuso existente (de -12:00 a +14:00).`) : ok('Fuso', `UTC${iso[8]}.`))
      }
    } else if (iso[4] && want === 'ISO 8601') checks.push(warn('Fuso', 'Sem fuso: cada sistema vai supor o seu.'))
    return checks
  }
  if (slash && want !== 'AAAA-MM-DD' && want !== 'ISO 8601') {
    const a = Number(slash[1])
    const b = Number(slash[2])
    let mdy = want === 'MM/DD/AAAA'
    const checks: Check[] = []
    if (want === 'Detectar') {
      if (a > 12 && b <= 12) checks.push(ok('Formato', 'DD/MM/AAAA (o primeiro número passa de 12).'))
      else if (b > 12 && a <= 12) {
        mdy = true
        checks.push(warn('Formato', 'MM/DD/AAAA, padrão americano (o segundo número passa de 12).'))
      } else if (a <= 12 && b <= 12 && a !== b) checks.push(warn('Formato', 'Ambígua: pode ser DD/MM ou MM/DD. Lida como DD/MM/AAAA.'))
      else checks.push(ok('Formato', 'DD/MM/AAAA.'))
    } else checks.push(ok('Formato', `${want}.`))
    if (slash[1].length === 1 || slash[2].length === 1) checks.push(warn('Zeros', 'Dia ou mês sem zero à esquerda.'))
    const result = dayChecks(Number(slash[3]), mdy ? a : b, mdy ? b : a, options)
    checks.push(...result.checks)
    if (slash[4]) checks.push(...timeChecks(Number(slash[4]), Number(slash[5]), slash[6] ? Number(slash[6]) : undefined))
    return checks
  }
  return [bad('Formato', want === 'Detectar' ? 'Não é data, horário, ISO 8601 nem timestamp reconhecível.' : `Não está no formato ${want}.`)]
}

export function validateDates(text: string, options: DateOptions): Outcome {
  const items = lines(text)
  if (!items.length) return emptyInput()
  return { verdicts: items.map((item) => verdict(item, parseLine(item, options.formato, options), { ok: 'Data válida', bad: 'Data inválida', warn: 'Data com ressalva' })) }
}
