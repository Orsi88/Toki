import { cnpjValid, cpfValid, emailChecks } from './people.ts'
import { bad, emptyInput, fmtDate, lines, ok, verdict, warn, type Check, type Outcome } from './verdict.ts'

const BRANDS: [string, RegExp, number[]][] = [
  ['Elo', /^(4011|4312|4389|4514|4573|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/, [16]],
  ['Hipercard', /^(606282|3841)/, [13, 16, 19]],
  ['Amex', /^3[47]/, [15]],
  ['Diners', /^3(0[0-5]|[68])/, [14, 16]],
  ['JCB', /^35(2[89]|[3-8])/, [16, 17, 18, 19]],
  ['Discover', /^(6011|65|64[4-9])/, [16, 17, 18, 19]],
  ['Mastercard', /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, [16]],
  ['Visa', /^4/, [13, 16, 19]],
]
const SANDBOX = new Set(['4111111111111111', '5555555555554444', '378282246310005', '4000000000000002', '5105105105105100', '4012888888881881'])
const BANKS: Record<string, string> = { '001': 'Banco do Brasil', '033': 'Santander', '041': 'Banrisul', '070': 'BRB', '077': 'Inter', '104': 'Caixa', '208': 'BTG Pactual', '237': 'Bradesco', '260': 'Nubank', '336': 'C6', '341': 'Itaú', '389': 'Mercantil', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob' }

export function luhn(digits: string) {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    let value = Number(digits[digits.length - 1 - index])
    if (index % 2) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
  }
  return sum % 10 === 0
}

function cardChecks(value: string, day: Date): Check[] {
  const expiry = /(\d{2})\s*\/\s*(\d{2}|\d{4})/.exec(value)
  const rest = expiry ? value.replace(expiry[0], ' ') : value
  const groups = rest.trim().split(/[\s|;,]+/).filter(Boolean)
  // O número costuma vir em grupos de 4; só há CVV no fim quando a linha também traz a validade.
  const hasCvv = Boolean(expiry) && groups.length > 1 && /^\d{3,4}$/.test(groups[groups.length - 1])
  const number = hasCvv ? groups.slice(0, -1).join('') : groups.join('')
  const cvv = hasCvv ? groups[groups.length - 1] : ''
  const digits = number.replace(/[\s.-]/g, '')
  if (/\D/.test(digits)) return [bad('Número', 'Tem caracteres além de dígitos.')]
  const brand = BRANDS.find(([, pattern]) => pattern.test(digits))
  const checks: Check[] = []
  checks.push(brand ? ok('Bandeira', brand[0]) : warn('Bandeira', 'Prefixo de bandeira não reconhecido.'))
  if (brand && !brand[2].includes(digits.length)) checks.push(bad('Tamanho', `${digits.length} dígitos; ${brand[0]} usa ${brand[2].join(' ou ')}.`))
  else if (digits.length < 12 || digits.length > 19) checks.push(bad('Tamanho', `${digits.length} dígitos; cartões têm de 12 a 19.`))
  else checks.push(ok('Tamanho', `${digits.length} dígitos.`))
  checks.push(luhn(digits) ? ok('Luhn', 'O dígito verificador confere.') : bad('Luhn', 'O dígito verificador não confere (algoritmo de Luhn).'))
  if (SANDBOX.has(digits)) checks.push(ok('Teste', 'Número público de teste dos gateways.'))
  if (expiry) {
    const month = Number(expiry[1])
    const year = Number(expiry[2].length === 2 ? `20${expiry[2]}` : expiry[2])
    if (month < 1 || month > 12) checks.push(bad('Validade', `Mês ${expiry[1]} não existe.`))
    else {
      const last = new Date(year, month, 0)
      checks.push(last < day ? bad('Validade', `Venceu no fim de ${expiry[1]}/${year}.`) : year - day.getFullYear() > 20 ? warn('Validade', 'Validade a mais de 20 anos: improvável.') : ok('Validade', `Até ${String(month).padStart(2, '0')}/${year}.`))
    }
  }
  if (cvv) {
    const size = brand?.[0] === 'Amex' ? 4 : 3
    checks.push(cvv.length === size ? ok('CVV', `${size} dígitos.`) : bad('CVV', `${cvv.length} dígitos; ${brand?.[0] ?? 'a bandeira'} usa ${size}.`))
  }
  return checks
}

export function crc16(value: string) {
  let crc = 0xffff
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function tlv(value: string) {
  const fields: { id: string; value: string }[] = []
  let at = 0
  while (at < value.length) {
    const id = value.slice(at, at + 2)
    const size = Number(value.slice(at + 2, at + 4))
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(value.slice(at + 2, at + 4)) || at + 4 + size > value.length) return { fields, broken: at }
    fields.push({ id, value: value.slice(at + 4, at + 4 + size) })
    at += 4 + size
  }
  return { fields, broken: -1 }
}

function pixKeyChecks(key: string): Check[] {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return [ok('Chave', 'Chave aleatória (EVP).')]
  if (key.includes('@')) {
    const checks = emailChecks(key)
    if (key.length > 77) checks.push(bad('Tamanho', 'Chave e-mail passa de 77 caracteres.'))
    if (key !== key.toLowerCase()) checks.push(warn('Caixa', 'O Bacen guarda chave e-mail em minúsculas.'))
    return [ok('Chave', 'Chave e-mail.'), ...checks]
  }
  if (key.startsWith('+')) return /^\+55\d{10,11}$/.test(key) ? [ok('Chave', 'Chave telefone no formato +55DDNÚMERO.')] : [bad('Chave', 'Chave telefone precisa ser +55, DDD e número, sem espaço nem traço.')]
  const digits = key.replace(/\D/g, '')
  if (/^\d{11}$/.test(key)) return cpfValid(key) ? [ok('Chave', 'Chave CPF, dígitos conferem.')] : [bad('Chave', '11 dígitos, mas não é CPF válido. Telefone precisa de +55.')]
  if (/^[0-9A-Z]{12}\d{2}$/.test(key)) return cnpjValid(key) ? [ok('Chave', 'Chave CNPJ, dígitos conferem.')] : [bad('Chave', 'Parece CNPJ, mas os dígitos não conferem.')]
  if (digits.length === 11 || digits.length === 14) return [bad('Chave', 'Chave CPF ou CNPJ vai só com dígitos, sem pontuação.')]
  return [bad('Chave', 'Não é CPF, CNPJ, e-mail, telefone +55 nem chave aleatória.')]
}

function pixPayloadChecks(payload: string): Check[] {
  const checks: Check[] = []
  const { fields, broken } = tlv(payload)
  if (broken >= 0) return [bad('Estrutura', `O campo na posição ${broken} não segue ID + tamanho + valor.`)]
  const get = (id: string) => fields.find((field) => field.id === id)?.value
  checks.push(get('00') === '01' ? ok('Versão', 'Payload EMV 01.') : bad('Versão', 'O campo 00 precisa ser 01.'))
  const account = fields.find((field) => Number(field.id) >= 26 && Number(field.id) <= 51 && field.value.toLowerCase().includes('br.gov.bcb.pix'))
  if (!account) checks.push(bad('Conta', 'Sem o campo do arranjo br.gov.bcb.pix.'))
  else {
    const inner = tlv(account.value).fields
    const key = inner.find((field) => field.id === '01')?.value
    const url = inner.find((field) => field.id === '25')?.value
    if (key) checks.push(...pixKeyChecks(key))
    else if (url) checks.push(ok('Chave', `PIX dinâmico: cobrança em ${url}.`))
    else checks.push(bad('Chave', 'Sem chave (01) nem URL de cobrança (25).'))
  }
  checks.push(get('53') === '986' ? ok('Moeda', 'Real (986).') : bad('Moeda', `Moeda ${get('53') ?? 'ausente'}; PIX usa 986.`))
  const amount = get('54')
  if (amount !== undefined) checks.push(/^\d{1,10}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? ok('Valor', `R$ ${Number(amount).toFixed(2).replace('.', ',')}.`) : bad('Valor', `"${amount}" não é valor positivo com ponto decimal.`))
  checks.push(get('58') === 'BR' ? ok('País', 'BR.') : bad('País', 'O campo 58 precisa ser BR.'))
  const name = get('59')
  checks.push(!name ? bad('Recebedor', 'Sem nome (59).') : name.length > 25 ? bad('Recebedor', 'Nome passa de 25 caracteres.') : ok('Recebedor', name))
  const city = get('60')
  checks.push(!city ? bad('Cidade', 'Sem cidade (60).') : city.length > 15 ? bad('Cidade', 'Cidade passa de 15 caracteres.') : ok('Cidade', city))
  const txid = tlv(get('62') ?? '').fields.find((field) => field.id === '05')?.value
  if (txid !== undefined && txid !== '***' && !/^[A-Za-z0-9]{1,25}$/.test(txid)) checks.push(bad('Identificador', 'O txid aceita até 25 letras e números.'))
  const crcField = payload.lastIndexOf('6304')
  if (crcField < 0 || crcField !== payload.length - 8) checks.push(bad('CRC16', 'O CRC (6304) precisa ser o último campo.'))
  else {
    const expected = crc16(payload.slice(0, crcField + 4))
    const given = payload.slice(-4).toUpperCase()
    checks.push(given === expected ? ok('CRC16', `Confere (${given}).`) : bad('CRC16', `Informado ${given}, calculado ${expected}: o payload foi alterado.`))
  }
  return checks
}

function mod10(digits: string) {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]) * weight
    if (value > 9) value = Math.floor(value / 10) + (value % 10)
    sum += value
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function mod11Bank(digits: string) {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const dv = 11 - (sum % 11)
  return dv === 0 || dv > 9 ? 1 : dv
}

function mod11Collection(digits: string) {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const rest = sum % 11
  return rest === 0 || rest === 1 ? 0 : rest === 10 ? 1 : 11 - rest
}

function dueDate(factor: number, day: Date) {
  if (!factor) return null
  const old = new Date(1997, 9, 7 + factor)
  const fresh = factor >= 1000 ? new Date(2025, 1, 22 + factor - 1000) : null
  if (!fresh) return old
  return Math.abs(fresh.getTime() - day.getTime()) < Math.abs(old.getTime() - day.getTime()) ? fresh : old
}

function bankBarcodeChecks(barcode: string, day: Date, fromLine: boolean): Check[] {
  const checks: Check[] = []
  const bank = barcode.slice(0, 3)
  checks.push(BANKS[bank] ? ok('Banco', `${bank} · ${BANKS[bank]}.`) : warn('Banco', `${bank}: código fora da lista dos bancos mais comuns.`))
  checks.push(barcode[3] === '9' ? ok('Moeda', 'Real (9).') : warn('Moeda', `Código de moeda ${barcode[3]}; boletos em real usam 9.`))
  const expected = mod11Bank(barcode.slice(0, 4) + barcode.slice(5))
  checks.push(Number(barcode[4]) === expected ? ok('DV geral', `Confere (${expected}).`) : bad('DV geral', `Informado ${barcode[4]}, calculado ${expected}${fromLine ? '' : ': código de barras alterado'}.`))
  const due = dueDate(Number(barcode.slice(5, 9)), day)
  checks.push(due ? (due < day ? warn('Vencimento', `${fmtDate(due)}: vencido.`) : ok('Vencimento', fmtDate(due))) : ok('Vencimento', 'Sem vencimento (fator 0000).'))
  const value = Number(barcode.slice(9, 19)) / 100
  checks.push(value > 0 ? ok('Valor', `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`) : ok('Valor', 'Valor em aberto (zero): o pagador informa.'))
  return checks
}

function boletoChecks(value: string, day: Date): Check[] {
  const digits = value.replace(/[\s.-]/g, '')
  if (/\D/.test(digits)) return [bad('Formato', 'Tem caracteres além de dígitos, espaço, ponto e hífen.')]
  if (digits.length === 47) {
    const fields: [string, string, number][] = [['Campo 1', digits.slice(0, 9), Number(digits[9])], ['Campo 2', digits.slice(10, 20), Number(digits[20])], ['Campo 3', digits.slice(21, 31), Number(digits[31])]]
    const checks: Check[] = [ok('Tipo', 'Linha digitável de boleto bancário (47 dígitos).')]
    for (const [label, body, dv] of fields) checks.push(mod10(body) === dv ? ok(label, 'DV confere.') : bad(label, `DV informado ${dv}, calculado ${mod10(body)}: erro de digitação neste trecho.`))
    const barcode = digits.slice(0, 4) + digits[32] + digits.slice(33, 47) + digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31)
    checks.push(...bankBarcodeChecks(barcode, day, true))
    return checks
  }
  if (digits.length === 44 && digits[0] !== '8') return [ok('Tipo', 'Código de barras de boleto bancário (44 dígitos).'), ...bankBarcodeChecks(digits, day, false)]
  if ((digits.length === 48 || digits.length === 44) && digits[0] === '8') {
    const checks: Check[] = [ok('Tipo', `Conta de consumo ou tributo (${digits.length === 48 ? 'linha digitável' : 'código de barras'}).`)]
    const reference = digits[2]
    const calc = reference === '6' || reference === '7' ? mod10 : reference === '8' || reference === '9' ? mod11Collection : null
    if (!calc) return [...checks, bad('Referência', `O 3º dígito (${reference}) precisa ser 6, 7, 8 ou 9.`)]
    let barcode = digits
    if (digits.length === 48) {
      barcode = ''
      for (let block = 0; block < 4; block += 1) {
        const body = digits.slice(block * 12, block * 12 + 11)
        const dv = Number(digits[block * 12 + 11])
        checks.push(calc(body) === dv ? ok(`Bloco ${block + 1}`, 'DV confere.') : bad(`Bloco ${block + 1}`, `DV informado ${dv}, calculado ${calc(body)}.`))
        barcode += body
      }
    }
    const general = calc(barcode.slice(0, 3) + barcode.slice(4))
    checks.push(Number(barcode[3]) === general ? ok('DV geral', `Confere (${general}).`) : bad('DV geral', `Informado ${barcode[3]}, calculado ${general}.`))
    const segment = { 1: 'prefeitura', 2: 'saneamento', 3: 'energia e gás', 4: 'telecomunicações', 5: 'órgão público', 6: 'carnê ou empresa', 7: 'multa de trânsito', 9: 'uso exclusivo do banco' }[Number(barcode[1])]
    checks.push(segment ? ok('Segmento', segment) : warn('Segmento', `Segmento ${barcode[1]} desconhecido.`))
    if (reference === '6' || reference === '8') checks.push(ok('Valor', `R$ ${(Number(barcode.slice(4, 15)) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`))
    return checks
  }
  return [bad('Tamanho', `${digits.length} dígitos; a linha digitável tem 47 (bancário) ou 48 (consumo), e o código de barras, 44.`)]
}

export function detectFinance(value: string) {
  if (/^000201/.test(value)) return 'PIX'
  const digits = value.replace(/[\s.-]/g, '')
  if (/^\d{44}$|^\d{47}$|^8\d{47}$/.test(digits)) return 'Boleto'
  if (/^\d{12,19}$/.test(digits) || /\d{2}\s*\/\s*\d{2}/.test(value)) return 'Cartão'
  return 'PIX'
}

export function validateFinance(text: string, tipo: string, day: Date): Outcome {
  const items = lines(text)
  if (!items.length) return emptyInput()
  return {
    verdicts: items.map((item) => {
      const kind = tipo === 'Detectar' ? detectFinance(item) : tipo
      const checks: Check[] = tipo === 'Detectar' ? [ok('Tipo', `Detectado como ${kind}.`)] : []
      if (kind === 'Cartão') checks.push(...cardChecks(item, day))
      else if (kind === 'Boleto') checks.push(...boletoChecks(item, day))
      else checks.push(...(item.startsWith('000201') ? pixPayloadChecks(item) : pixKeyChecks(item)))
      return verdict(item, checks, { ok: `${kind} válido`, bad: `${kind} inválido`, warn: `${kind} com ressalva` })
    }),
  }
}
