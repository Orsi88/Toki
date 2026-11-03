import { bad, emptyInput, fmtDate, lines, ok, verdict, warn, type Check, type Outcome } from './verdict.ts'

const FISCAL: Record<string, string> = { 0: 'RS', 1: 'DF, GO, MS, MT e TO', 2: 'AC, AM, AP, PA, RO e RR', 3: 'CE, MA e PI', 4: 'AL, PB, PE e RN', 5: 'BA e SE', 6: 'MG', 7: 'ES e RJ', 8: 'SP', 9: 'PR e SC' }
const DDD: Record<number, string> = {}
for (const [uf, codes] of Object.entries({
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], RJ: [21, 22, 24], ES: [27, 28], MG: [31, 32, 33, 34, 35, 37, 38], PR: [41, 42, 43, 44, 45, 46],
  SC: [47, 48, 49], RS: [51, 53, 54, 55], DF: [61], GO: [62, 64], TO: [63], MT: [65, 66], MS: [67], AC: [68], RO: [69], BA: [71, 73, 74, 75, 77],
  SE: [79], PE: [81, 87], AL: [82], PB: [83], RN: [84], CE: [85, 88], PI: [86, 89], PA: [91, 93, 94], AM: [92, 97], RR: [95], AP: [96], MA: [98, 99],
})) for (const code of codes) DDD[code] = uf
const CEP_REGION = ['SP (capital e região)', 'SP (interior)', 'RJ e ES', 'MG', 'BA e SE', 'PE, AL, PB e RN', 'CE, PI, MA, PA, AM, AC, AP e RR', 'DF, GO, TO, MT, MS e RO', 'PR e SC', 'RS']

export function cpfValid(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  const dv = (size: number) => {
    let sum = 0
    for (let index = 0; index < size; index += 1) sum += Number(digits[index]) * (size + 1 - index)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10])
}

function cnpjDigit(base: string) {
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - base.length)
  const sum = base.split('').reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0) % 11
  return sum < 2 ? 0 : 11 - sum
}

export function cnpjValid(value: string) {
  const clean = value.replace(/[./-\s]/g, '').toUpperCase()
  if (!/^[0-9A-Z]{12}\d{2}$/.test(clean) || /^(.)\1{13}$/.test(clean)) return false
  const first = cnpjDigit(clean.slice(0, 12))
  return first === Number(clean[12]) && cnpjDigit(clean.slice(0, 13)) === Number(clean[13])
}

function cpfChecks(value: string): Check[] {
  const digits = value.replace(/\D/g, '')
  const masked = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)
  const checks: Check[] = []
  if (/[^\d.\-\s]/.test(value)) checks.push(bad('Caracteres', 'Tem caracteres além de dígitos, ponto e hífen.'))
  if (digits.length !== 11) return [...checks, bad('Tamanho', `${digits.length} dígitos; o CPF tem 11.`)]
  checks.push(masked || /^\d{11}$/.test(value) ? ok('Formato', masked ? 'Com máscara 000.000.000-00.' : 'Só dígitos, sem máscara.') : warn('Formato', 'Máscara fora do padrão 000.000.000-00.'))
  if (/^(\d)\1{10}$/.test(digits)) return [...checks, bad('Sequência', 'Todos os dígitos iguais: passa no cálculo, mas a Receita não emite.')]
  checks.push(cpfValid(digits) ? ok('Dígitos verificadores', `Conferem (${digits.slice(9)}).`) : bad('Dígitos verificadores', 'Não conferem com os 9 primeiros dígitos.'))
  checks.push(ok('Região fiscal', `9º dígito ${digits[8]}: ${FISCAL[digits[8]]}.`))
  return checks
}

function cnpjChecks(value: string): Check[] {
  const clean = value.replace(/[./-\s]/g, '').toUpperCase()
  const checks: Check[] = []
  if (clean.length !== 14) return [bad('Tamanho', `${clean.length} caracteres; o CNPJ tem 14.`)]
  if (!/^[0-9A-Z]{12}\d{2}$/.test(clean)) return [bad('Formato', 'Os 12 primeiros precisam ser letras maiúsculas ou dígitos e os 2 últimos, dígitos.')]
  checks.push(/[A-Z]/.test(clean) ? ok('Formato', 'CNPJ alfanumérico (padrão da Receita a partir de julho de 2026).') : ok('Formato', 'CNPJ numérico.'))
  if (/^(.)\1{13}$/.test(clean)) return [...checks, bad('Sequência', 'Todos os caracteres iguais.')]
  checks.push(cnpjValid(clean) ? ok('Dígitos verificadores', `Conferem (${clean.slice(12)}).`) : bad('Dígitos verificadores', 'Não conferem.'))
  const branch = clean.slice(8, 12)
  checks.push(ok('Estabelecimento', branch === '0001' ? 'Matriz (0001).' : `Filial ${branch}.`))
  return checks
}

export function emailChecks(value: string): Check[] {
  const checks: Check[] = []
  const at = value.split('@')
  if (at.length !== 2) return [bad('Formato', at.length < 2 ? 'Sem @.' : 'Mais de um @.')]
  const [local, domain] = at
  if (!local) checks.push(bad('Usuário', 'Nada antes do @.'))
  else if (local.length > 64) checks.push(bad('Usuário', `${local.length} caracteres antes do @; o limite é 64.`))
  else if (/^\.|\.$|\.\./.test(local)) checks.push(bad('Usuário', 'Ponto no começo, no fim ou dois seguidos antes do @.'))
  else if (/[^\w.!#$%&'*+/=?^`{|}~-]/.test(local)) checks.push(bad('Usuário', 'Caractere não permitido antes do @ (espaço, acento ou símbolo).'))
  else checks.push(ok('Usuário', local))
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) checks.push(bad('Domínio', domain ? `"${domain}" não é um domínio com ponto e sem caracteres inválidos.` : 'Nada depois do @.'))
  else if (domain.split('.').some((part) => part.startsWith('-') || part.endsWith('-'))) checks.push(bad('Domínio', 'Parte do domínio começa ou termina com hífen.'))
  else if (/^(exemplo|example)\.|\.(test|example|invalid|localhost)$/i.test(domain)) checks.push(ok('Domínio', `${domain} (reservado para testes: não entrega em caixa real).`))
  else checks.push(ok('Domínio', domain))
  if (value.length > 254) checks.push(bad('Tamanho', `${value.length} caracteres; o limite é 254.`))
  if (value !== value.trim()) checks.push(warn('Espaços', 'Tem espaço nas pontas.'))
  if (/[A-Z]/.test(domain)) checks.push(warn('Caixa', 'Domínio com maiúsculas; normalize para minúsculas antes de comparar.'))
  return checks
}

function phoneChecks(value: string): Check[] {
  let digits = value.replace(/\D/g, '')
  const checks: Check[] = []
  if (/[^\d\s()+-]/.test(value)) checks.push(bad('Caracteres', 'Tem caracteres além de dígitos, espaço, parênteses, + e hífen.'))
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2)
    checks.push(ok('País', value.trim().startsWith('+') ? '+55 (Brasil).' : '55 (Brasil), sem o +.'))
  }
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if (digits.length !== 10 && digits.length !== 11) return [...checks, bad('Tamanho', `${digits.length} dígitos sem o país; precisa de DDD + 8 (fixo) ou 9 (celular).`)]
  const ddd = Number(digits.slice(0, 2))
  checks.push(DDD[ddd] ? ok('DDD', `${ddd} · ${DDD[ddd]}.`) : bad('DDD', `${ddd} não é um DDD em uso no Brasil.`))
  const number = digits.slice(2)
  if (number.length === 9) checks.push(number.startsWith('9') ? ok('Tipo', 'Celular (9 dígitos começando com 9).') : bad('Tipo', 'Com 9 dígitos, precisa começar com 9 (celular).'))
  else checks.push(/^[2-5]/.test(number) ? ok('Tipo', 'Fixo (8 dígitos começando de 2 a 5).') : /^[6-9]/.test(number) ? bad('Tipo', 'Com 8 dígitos começando com 6 a 9, falta o 9 do celular.') : bad('Tipo', 'Fixo precisa começar de 2 a 5.'))
  if (/^(\d)\1+$/.test(number)) checks.push(bad('Sequência', 'Número com todos os dígitos iguais.'))
  return checks
}

function cepChecks(value: string): Check[] {
  const digits = value.replace(/\D/g, '')
  if (/[^\d.\-\s]/.test(value)) return [bad('Caracteres', 'Tem caracteres além de dígitos e hífen.')]
  if (digits.length !== 8) return [bad('Tamanho', `${digits.length} dígitos; o CEP tem 8.`)]
  const checks = [/^\d{5}-\d{3}$/.test(value) ? ok('Formato', '00000-000.') : /^\d{8}$/.test(value) ? ok('Formato', 'Só dígitos.') : warn('Formato', 'Máscara fora do padrão 00000-000.')]
  if (/^0{5}/.test(digits) || /^(\d)\1{7}$/.test(digits)) checks.push(bad('Faixa', 'Faixa que os Correios não usam.'))
  else checks.push(ok('Região', `Começa com ${digits[0]}: ${CEP_REGION[Number(digits[0])]}.`))
  checks.push(warn('Existência', 'A faixa confere, mas só a base dos Correios diz se o logradouro existe.'))
  return checks
}

export function parseBirth(value: string) {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const [y, m, d] = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0]
  if (!y) return null
  const date = new Date(y, m - 1, d)
  return { date, exists: date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d, y, m, d }
}

export function ageOn(date: Date, day: Date) {
  let age = day.getFullYear() - date.getFullYear()
  if (day.getMonth() < date.getMonth() || (day.getMonth() === date.getMonth() && day.getDate() < date.getDate())) age -= 1
  return age
}

function birthChecks(value: string, day: Date): Check[] {
  const parsed = parseBirth(value.trim())
  if (!parsed) return [bad('Formato', 'Use DD/MM/AAAA ou AAAA-MM-DD.')]
  if (!parsed.exists) return [bad('Data', `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y} não existe.`)]
  const age = ageOn(parsed.date, day)
  if (parsed.date > day) return [ok('Data', fmtDate(parsed.date)), bad('Idade', 'Nascimento no futuro.')]
  const checks = [ok('Data', fmtDate(parsed.date)), age > 120 ? bad('Idade', `${age} anos: acima do plausível.`) : ok('Idade', `${age} anos em ${fmtDate(day)}.`)]
  checks.push(age >= 18 ? ok('Maioridade', 'Maior de idade.') : warn('Maioridade', 'Menor de idade.'))
  if (parsed.d === day.getDate() && parsed.m === day.getMonth() + 1) checks.push(warn('Aniversário', 'Faz aniversário na data de referência: bom caso de fronteira.'))
  return checks
}

function nameChecks(value: string): Check[] {
  const checks: Check[] = []
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!value.trim()) return [bad('Preenchimento', 'Vazio.')]
  if (/\d/.test(value)) checks.push(bad('Caracteres', 'Tem números.'))
  if (/[^\p{L}\s'.-]/u.test(value)) checks.push(bad('Caracteres', 'Tem símbolos além de apóstrofo, ponto e hífen.'))
  checks.push(parts.length >= 2 ? ok('Partes', `${parts.length} partes.`) : warn('Partes', 'Só um nome, sem sobrenome.'))
  if (/\s{2,}/.test(value.trim())) checks.push(warn('Espaços', 'Espaços duplos entre as partes.'))
  if (value !== value.trim()) checks.push(warn('Espaços', 'Espaço nas pontas.'))
  if (value.length > 60) checks.push(warn('Tamanho', `${value.length} caracteres: pode não caber em campos de 60.`))
  if (value === value.toUpperCase() && /\p{L}/u.test(value)) checks.push(warn('Caixa', 'Tudo em maiúsculas.'))
  if (/[^\x00-\x7f]/.test(value)) checks.push(ok('Acentos', 'Tem acentos: confira se o sistema grava em UTF-8.'))
  return checks
}

export function detectPerson(value: string) {
  const digits = value.replace(/\D/g, '')
  if (value.includes('@')) return 'E-mail'
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)) return 'CPF'
  if (/^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}$/i.test(value) && value.replace(/[./-]/g, '').length === 14) return 'CNPJ'
  if (/^\d{5}-\d{3}$/.test(value) || (/^\d{8}$/.test(value))) return 'CEP'
  if (/^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/.test(value)) return 'Nascimento'
  if (/^\+|\(\d{2}\)/.test(value) || ((digits.length === 10 || digits.length === 13) && /^[\d\s()+-]+$/.test(value))) return 'Telefone'
  if (/^\d{11}$/.test(value)) return cpfValid(value) ? 'CPF' : 'Telefone'
  if (/^\d{14}$/.test(value)) return 'CNPJ'
  if (/^[\d\s()+-]+$/.test(value)) return 'Telefone'
  return 'Nome'
}

export function validatePeople(text: string, tipo: string, day: Date): Outcome {
  const items = lines(text)
  if (!items.length) return emptyInput()
  const seen = new Map<string, number>()
  return {
    verdicts: items.map((item) => {
      const kind = tipo === 'Detectar' ? detectPerson(item) : tipo
      const checks: Check[] = tipo === 'Detectar' ? [ok('Tipo', `Detectado como ${kind}.`)] : []
      checks.push(...(kind === 'CPF' ? cpfChecks(item) : kind === 'CNPJ' ? cnpjChecks(item) : kind === 'E-mail' ? emailChecks(item) : kind === 'Telefone' ? phoneChecks(item) : kind === 'CEP' ? cepChecks(item) : kind === 'Nascimento' ? birthChecks(item, day) : nameChecks(item)))
      const normal = `${kind}:${['CPF', 'CNPJ', 'Telefone', 'CEP'].includes(kind) ? item.replace(/\W/g, '').toUpperCase() : item.toLowerCase()}`
      const before = seen.get(normal) ?? 0
      seen.set(normal, before + 1)
      if (before) checks.push(warn('Duplicidade', 'O mesmo valor já apareceu antes na lista.'))
      return verdict(item, checks, { ok: `${kind} válido`, bad: `${kind} inválido`, warn: `${kind} com ressalva` })
    }),
  }
}
