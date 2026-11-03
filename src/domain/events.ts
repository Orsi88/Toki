import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { EVENT_AREAS, type EventKind, type Tone } from './eventRules.ts'
import { cpfValid } from './inspect/people.ts'
import { bad, ok, verdict, warn, type Check, type Verdict } from './inspect/verdict.ts'
import { encodePng } from './media.ts'
import { cpfD, fmtCpf, getReferenceDate, person } from './mfEngine.ts'
import { qrRaster } from './symbols.ts'

// Massas de eventos: ingressos, credenciais e cupons viram um código assinado que cabe num QR Code,
// e a validação simula o check-in só com o que está no código. A assinatura é de demonstração.

export { EVENT_AREAS, EVENT_KINDS, EVENT_RULES, type EventKind, type Tone } from './eventRules.ts'
export type { Check, Verdict } from './inspect/verdict.ts'

const KEY = 'massforge-demo'
export const TICKET_TYPES = ['Inteira', 'Meia', 'Cortesia']
export const ROLES: Record<string, string[]> = {
  Participante: ['Geral'],
  Staff: ['Geral', 'Palco', 'Backstage'],
  Imprensa: ['Geral', 'Imprensa'],
  Palestrante: ['Geral', 'Palco', 'Camarim'],
  Produção: ['Geral', 'Palco', 'Backstage', 'Camarim'],
}
const CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export type Sector = { nome: string; preco: number }

// Tudo opcional além do básico: o que não vier preenchido é sorteado ou usa o padrão.
export type EventConfig = {
  tipo: EventKind
  regra: string
  evento: string
  nomeEvento: string
  area: string
  idadeMin: number
  data?: string
  horario?: string
  local?: string
  cidade?: string
  organizador?: string
  setores?: Sector[]
  tiposIngresso?: string[]
  titular?: string
  assento?: boolean
  funcoes?: string[]
  categorias?: string[]
  valorInscricao?: number
  prefixo?: string
  desconto?: number
  limite?: number
  inicio?: string
  fim?: string
}

export const EVENT_DEFAULTS = {
  evento: 'FEST-2026',
  nomeEvento: 'Festival de Testes 2026',
  horario: '20:00',
  local: 'Arena Central',
  cidade: 'São Paulo, SP',
  organizador: 'Toki Produções',
  setores: [{ nome: 'Pista', preco: 180 }, { nome: 'Arquibancada', preco: 120 }, { nome: 'Camarote', preco: 450 }, { nome: 'VIP', preco: 900 }] as Sector[],
  tiposIngresso: ['Inteira', 'Meia', 'Cortesia'],
  funcoes: Object.keys(ROLES),
  categorias: ['Estudante', 'Profissional', 'Palestrante'],
  valorInscricao: 250,
  limite: 100,
}

export type EventRow = {
  tag: string
  tone: Tone
  rule: string
  why: string
  fields: [string, string, string][]
}

type Random = () => number

const pick = <T,>(random: Random, list: T[]) => list[Math.floor(random() * list.length)]
const int = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const pad = (value: number, size = 2) => String(value).padStart(size, '0')
const ruleKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const qrSafe = (value: string) => value.replace(/[|\r\n]/g, ' ').trim()
const upperKey = (value: string) => qrSafe(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_')
export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

export function ymd(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function parseYmd(value: string) {
  if (!/^\d{8}$/.test(value)) return null
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)))
  return ymd(date) === value ? date : null
}

function fromInput(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, '') : ''
}

export function showYmd(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}` : value
}

export function signature(body: string) {
  let hash = 0x811c9dc5
  for (const char of KEY + '|' + body) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}

const sign = (parts: string[]) => {
  const body = parts.join('|')
  return `${body}|${signature(body)}`
}

function serial(random: Random, prefix: string) {
  return `${prefix}-${Array.from({ length: 6 }, () => pick(random, CODE_CHARS.split(''))).join('')}`
}

export function couponCheck(base: string) {
  let sum = 0
  for (let index = 0; index < base.length; index += 1) {
    const value = CODE_CHARS.indexOf(base[index])
    sum += (value < 0 ? base.charCodeAt(index) : value) * (index + 1)
  }
  return CODE_CHARS[sum % CODE_CHARS.length]
}

function row(tag: string, tone: Tone, rule: string, why: string, fields: [string, string, string][]): EventRow {
  return { tag, tone, rule: ruleKey(rule), why, fields: [...fields, ['Regra aplicada', 'regra', why]] }
}

function otherEvent(config: EventConfig, random: Random) {
  return `${config.evento.split('-')[0] || 'EVT'}-${int(random, 1990, 2019)}`
}

function eventDay(config: EventConfig, random: Random) {
  return fromInput(config.data) || ymd(addDays(getReferenceDate(), int(random, 10, 60)))
}

function ticket(config: EventConfig, random: Random): EventRow[] {
  const today = getReferenceDate()
  const holder = qrSafe(config.titular ?? '') || person(random).nome
  const id = serial(random, 'TKT')
  const types = config.tiposIngresso?.length ? config.tiposIngresso : EVENT_DEFAULTS.tiposIngresso
  const type = pick(random, types)
  const sectors = config.setores?.filter((item) => item.nome.trim()).length ? config.setores.filter((item) => item.nome.trim()) : EVENT_DEFAULTS.setores
  const sector = pick(random, sectors)
  const numbered = config.assento ?? true
  const seat = numbered && !/pista/i.test(sector.nome) ? `${pick(random, 'ABCDEFGH'.split(''))}${int(random, 1, 40)}` : '-'
  const price = type === 'Cortesia' ? 0 : type === 'Meia' ? sector.preco / 2 : sector.preco
  let event = config.evento
  let day = eventDay(config, random)
  let status = 'A'
  let tamper = false
  let tag = 'entrada liberada'
  let tone: Tone = 'ok'
  let why = 'Assinatura confere, evento certo, dentro da validade e ainda não utilizado.'
  switch (config.regra) {
    case 'Já utilizado':
      status = 'U'
      tag = 'barrado · já utilizado'
      tone = 'bad'
      why = 'O ingresso já passou pela catraca. Validar o mesmo código duas vezes também acusa reentrada.'
      break
    case 'Cancelado':
      status = 'C'
      tag = 'barrado · cancelado'
      tone = 'bad'
      why = 'Ingresso cancelado ou estornado depois da compra.'
      break
    case 'Expirado':
      day = ymd(addDays(today, -int(random, 1, 30)))
      tag = 'barrado · expirado'
      tone = 'bad'
      why = `O evento foi em ${showYmd(day)}, antes da data do check-in.`
      break
    case 'Outro evento':
      event = otherEvent(config, random)
      tag = 'barrado · outro evento'
      tone = 'bad'
      why = `O código é do evento ${event}, não de ${config.evento}.`
      break
    case 'QR adulterado':
      tamper = true
      tag = 'barrado · QR adulterado'
      tone = 'bad'
      why = 'O setor foi trocado depois da assinatura, então a assinatura não confere.'
      break
  }
  if (tone === 'ok' && type === 'Meia') {
    tag = 'liberado · conferir meia'
    tone = 'warn'
    why = `${why} É meia-entrada: a portaria pede o comprovante.`
  }
  const sectorKey = upperKey(sector.nome)
  let qr = config.regra === 'Formato inválido'
    ? `INGRESSO-${id}-${Math.floor(random() * 1e9)}`
    : sign(['MFT1', event, id, upperKey(type), sectorKey, seat, day, status])
  if (tamper) qr = qr.replace(`|${sectorKey}|`, sectorKey === 'VIP' ? '|CAMAROTE|' : '|VIP|')
  if (config.regra === 'Formato inválido') {
    tag = 'barrado · formato inválido'
    tone = 'bad'
    why = 'O conteúdo do QR não segue o formato do ingresso.'
  }
  return [row(tag, tone, config.regra, why, [
    ['Código', 'codigo', id],
    ['Evento', 'evento', event],
    ['Nome do evento', 'nome_evento', qrSafe(config.nomeEvento) || EVENT_DEFAULTS.nomeEvento],
    ['Data', 'data', showYmd(day)],
    ['Horário', 'horario', config.horario || EVENT_DEFAULTS.horario],
    ['Local', 'local', config.local ?? EVENT_DEFAULTS.local],
    ['Cidade', 'cidade', config.cidade ?? EVENT_DEFAULTS.cidade],
    ['Organizador', 'organizador', config.organizador ?? EVENT_DEFAULTS.organizador],
    ['Titular', 'titular', holder],
    ['Tipo', 'tipo', type],
    ['Setor', 'setor', sector.nome],
    ['Assento', 'assento', seat],
    ['Preço', 'preco', money(price)],
    ['Status', 'status', { A: 'Ativo', U: 'Utilizado', C: 'Cancelado' }[status] ?? status],
    ['QR Code', 'qr', qr],
  ])]
}

function credential(config: EventConfig, random: Random): EventRow[] {
  const today = getReferenceDate()
  const holder = qrSafe(config.titular ?? '') || person(random).nome
  const id = serial(random, 'CRD')
  const allowed = (config.funcoes?.length ? config.funcoes : EVENT_DEFAULTS.funcoes).filter((name) => ROLES[name])
  let role = pick(random, allowed.length ? allowed : EVENT_DEFAULTS.funcoes)
  if (config.regra === 'Válida' && !ROLES[role].includes(config.area)) {
    role = allowed.find((name) => ROLES[name].includes(config.area)) ?? 'Produção'
  }
  let areas = ROLES[role]
  let event = config.evento
  let until = eventDay(config, random)
  let status = 'A'
  let tamper = false
  let tag = 'acesso liberado'
  let tone: Tone = 'ok'
  let why = `A credencial cobre a área ${config.area} e está dentro da validade.`
  switch (config.regra) {
    case 'Área não autorizada':
      areas = EVENT_AREAS.filter((area) => area !== config.area).slice(0, 2)
      role = 'Imprensa'
      tag = 'barrado · área não autorizada'
      tone = 'bad'
      why = `A credencial libera ${areas.join(' e ')}, não ${config.area}.`
      break
    case 'Vencida':
      until = ymd(addDays(today, -int(random, 1, 15)))
      tag = 'barrado · vencida'
      tone = 'bad'
      why = `A credencial venceu em ${showYmd(until)}.`
      break
    case 'Revogada':
      status = 'R'
      tag = 'barrado · revogada'
      tone = 'bad'
      why = 'A credencial foi revogada pela organização.'
      break
    case 'Outro evento':
      event = otherEvent(config, random)
      tag = 'barrado · outro evento'
      tone = 'bad'
      why = `A credencial é do evento ${event}, não de ${config.evento}.`
      break
    case 'QR adulterado':
      tamper = true
      tag = 'barrado · QR adulterado'
      tone = 'bad'
      why = 'Áreas acrescentadas depois da assinatura, então a assinatura não confere.'
      break
  }
  let qr = sign(['MFC1', event, id, upperKey(role), areas.join('+'), until, status])
  if (tamper) qr = qr.replace(`|${areas.join('+')}|`, `|${EVENT_AREAS.join('+')}|`)
  return [row(tag, tone, config.regra, why, [
    ['Código', 'codigo', id],
    ['Evento', 'evento', event],
    ['Nome do evento', 'nome_evento', qrSafe(config.nomeEvento) || EVENT_DEFAULTS.nomeEvento],
    ['Nome', 'nome', holder],
    ['Função', 'funcao', role],
    ['Áreas', 'areas', areas.join(', ')],
    ['Válida até', 'valida_ate', showYmd(until)],
    ['Status', 'status', status === 'R' ? 'Revogada' : 'Ativa'],
    ['QR Code', 'qr', qr],
  ])]
}

function birthFor(age: number, random: Random) {
  const today = getReferenceDate()
  const date = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  date.setDate(date.getDate() - int(random, 1, 300))
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

function registration(config: EventConfig, random: Random): EventRow[] {
  const someone = person(random)
  const minimum = Math.max(0, config.idadeMin)
  const digits = cpfD(random, someone.uf)
  let cpf = fmtCpf(digits.join(''), true)
  let email = someone.email
  let name = qrSafe(config.titular ?? '') || someone.nome
  let birth = birthFor(int(random, Math.max(minimum, 18), 60), random)
  const fee = config.valorInscricao ?? EVENT_DEFAULTS.valorInscricao
  let payment = fee > 0 ? 'Pago' : 'Isento'
  let tag = 'inscrição válida'
  let tone: Tone = 'ok'
  let why = 'Todos os campos obrigatórios preenchidos, CPF e e-mail válidos e pagamento confirmado.'
  switch (config.regra) {
    case 'CPF inválido': {
      const wrong = [...digits]
      wrong[10] = (wrong[10] + 1) % 10
      cpf = fmtCpf(wrong.join(''), true)
      tag = 'recusada · CPF inválido'
      tone = 'bad'
      why = 'O último dígito verificador do CPF não confere.'
      break
    }
    case 'E-mail inválido':
      email = email.replace('@', '')
      tag = 'recusada · e-mail inválido'
      tone = 'bad'
      why = 'O e-mail está sem @.'
      break
    case 'Campo obrigatório ausente':
      name = ''
      tag = 'recusada · campo ausente'
      tone = 'bad'
      why = 'O nome está vazio.'
      break
    case 'Menor de idade':
      birth = birthFor(Math.max(0, minimum - int(random, 1, 4)), random)
      tag = 'recusada · menor de idade'
      tone = 'bad'
      why = `A idade fica abaixo do mínimo de ${minimum} anos.`
      break
    case 'Pagamento pendente':
      payment = 'Pendente'
      tag = 'atenção · pagamento pendente'
      tone = 'warn'
      why = 'Os dados estão certos, mas o pagamento ainda não foi confirmado.'
      break
  }
  const categories = config.categorias?.filter((item) => item.trim()).length ? config.categorias.filter((item) => item.trim()) : EVENT_DEFAULTS.categorias
  const fields: [string, string, string][] = [
    ['Inscrição', 'inscricao', serial(random, 'INS')],
    ['Evento', 'evento', config.evento],
    ['Nome do evento', 'nome_evento', qrSafe(config.nomeEvento) || EVENT_DEFAULTS.nomeEvento],
    ['Nome', 'nome', name],
    ['CPF', 'cpf', cpf],
    ['E-mail', 'email', email],
    ['Nascimento', 'nascimento', birth],
    ['Categoria', 'categoria', pick(random, categories)],
    ['Valor', 'valor', money(fee)],
    ['Pagamento', 'pagamento', payment],
  ]
  if (config.regra !== 'Inscrição duplicada') return [row(tag, tone, config.regra, why, fields)]
  const first = row('inscrição válida', 'ok', config.regra, 'Primeira inscrição deste CPF.', fields)
  const copy = fields.map(([label, key, value]) => [label, key, key === 'inscricao' ? serial(random, 'INS') : value] as [string, string, string])
  return [first, row('recusada · inscrição duplicada', 'bad', config.regra, `O CPF ${cpf} já tem inscrição neste evento.`, copy)]
}

function coupon(config: EventConfig, random: Random): EventRow[] {
  const today = getReferenceDate()
  const percent = config.desconto && config.desconto > 0 ? Math.min(100, Math.round(config.desconto)) : pick(random, [5, 10, 15, 20, 50])
  const prefix = (qrSafe(config.prefixo ?? '') || config.evento.split('-')[0] || 'EVT').normalize('NFD').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'EVT'
  const base = `${prefix}${percent}-${Array.from({ length: 4 }, () => pick(random, CODE_CHARS.split(''))).join('')}`
  let code = `${base}-${couponCheck(base)}`
  let event = config.evento
  let start = fromInput(config.inicio) || ymd(addDays(today, -int(random, 5, 30)))
  let end = fromInput(config.fim) || ymd(addDays(today, int(random, 5, 60)))
  const limit = config.limite && config.limite > 0 ? Math.round(config.limite) : pick(random, [50, 100, 200, 500])
  let used = int(random, 0, limit - 1)
  let tag = 'desconto aplicado'
  let tone: Tone = 'ok'
  let why = `Cupom de ${percent}% dentro da vigência, com ${limit - used} usos restantes.`
  switch (config.regra) {
    case 'Expirado':
      end = ymd(addDays(today, -int(random, 1, 20)))
      if (start > end) start = ymd(addDays(parseYmd(end) ?? today, -30))
      tag = 'recusado · expirado'
      tone = 'bad'
      why = `A vigência terminou em ${showYmd(end)}.`
      break
    case 'Ainda não vigente':
      start = ymd(addDays(today, int(random, 1, 20)))
      if (end < start) end = ymd(addDays(parseYmd(start) ?? today, 30))
      tag = 'recusado · ainda não vigente'
      tone = 'bad'
      why = `A vigência começa em ${showYmd(start)}.`
      break
    case 'Esgotado':
      used = limit
      tag = 'recusado · esgotado'
      tone = 'bad'
      why = `Os ${limit} usos do cupom já foram consumidos.`
      break
    case 'Dígito inválido': {
      const right = couponCheck(base)
      code = `${base}-${CODE_CHARS[(CODE_CHARS.indexOf(right) + 1) % CODE_CHARS.length]}`
      tag = 'recusado · dígito inválido'
      tone = 'bad'
      why = `O dígito verificador certo seria ${right}. Código digitado errado.`
      break
    }
    case 'Outro evento':
      event = otherEvent(config, random)
      tag = 'recusado · outro evento'
      tone = 'bad'
      why = `O cupom é do evento ${event}, não de ${config.evento}.`
      break
    default: {
      const day = ymd(today)
      if (day < start || day > end) {
        tag = 'recusado · fora da vigência'
        tone = 'bad'
        why = `A vigência informada (${showYmd(start)} a ${showYmd(end)}) não inclui a data de hoje.`
      }
    }
  }
  return [row(tag, tone, config.regra, why, [
    ['Cupom', 'cupom', code],
    ['Evento', 'evento', event],
    ['Nome do evento', 'nome_evento', qrSafe(config.nomeEvento) || EVENT_DEFAULTS.nomeEvento],
    ['Desconto', 'desconto', `${percent}%`],
    ['Início', 'inicio', showYmd(start)],
    ['Fim', 'fim', showYmd(end)],
    ['Limite de usos', 'limite', String(limit)],
    ['Usos', 'usos', String(used)],
    ['QR Code', 'qr', sign(['MFV1', event, code, String(percent), start, end, String(limit), String(used)])],
  ])]
}

export function eventRows(config: EventConfig, random: Random): EventRow[] {
  if (config.tipo === 'Credencial') return credential(config, random)
  if (config.tipo === 'Inscrição') return registration(config, random)
  if (config.tipo === 'Cupom') return coupon(config, random)
  return ticket(config, random)
}

// Lote: as regras escolhidas se revezam, então 10 itens com 2 regras dão 5 de cada.
export function eventBatch(config: Omit<EventConfig, 'regra'>, rules: string[], count: number, random: Random): EventRow[] {
  const chosen = rules.length ? rules : ['Válido']
  const out: EventRow[] = []
  for (let index = 0; index < count; index += 1) out.push(...eventRows({ ...config, regra: chosen[index % chosen.length] } as EventConfig, random))
  return out
}

export const fieldOf = (item: EventRow, key: string) => item.fields.find(([, name]) => name === key)?.[2] ?? ''

function qrPng(value: string) {
  const raster = qrRaster(value, 4, 'M', 6)
  return encodePng(new Uint8Array(raster.data.buffer), raster.width, raster.height, true)
}

// Um PNG por QR, para testar leitores e câmeras com a imagem e não só com o texto.
export async function qrImagesZip(items: { name: string; qr: string }[]) {
  const zip = new JSZip()
  const used = new Set<string>()
  for (const item of items) {
    const stem = item.name.replace(/[^\w.-]+/g, '_') || 'qr'
    let name = stem
    for (let index = 2; used.has(name); index += 1) name = `${stem}_${index}`
    used.add(name)
    zip.file(`${name}.png`, qrPng(item.qr))
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

const PDF_TEXT = (value: string) => value.normalize('NFC').replace(/[^\x20-\x7e\u00a0-ÿ]/g, '?')

// Um item por página, com os campos e o QR, para imprimir ou testar leitura em papel.
export async function eventsPdf(items: EventRow[], tipo: EventKind) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const title = { Ingresso: 'Ingresso', Credencial: 'Credencial', Inscrição: 'Comprovante de inscrição', Cupom: 'Cupom de desconto' }[tipo]
  for (const item of items) {
    const page = doc.addPage([420, 595])
    page.drawRectangle({ x: 0, y: 535, width: 420, height: 60, color: rgb(0.4, 0.314, 0.294) })
    page.drawText(PDF_TEXT(title), { x: 28, y: 572, size: 10, font, color: rgb(0.918, 0.945, 0.953) })
    page.drawText(PDF_TEXT(fieldOf(item, 'nome_evento')).slice(0, 40), { x: 28, y: 550, size: 16, font: bold, color: rgb(1, 1, 1) })
    let y = 505
    for (const [label, key, value] of item.fields) {
      if (['qr', 'regra', 'nome_evento'].includes(key) || !value) continue
      page.drawText(PDF_TEXT(label.toUpperCase()), { x: 28, y, size: 7, font: bold, color: rgb(0.45, 0.47, 0.45) })
      page.drawText(PDF_TEXT(value).slice(0, 48), { x: 28, y: y - 13, size: 11, font, color: rgb(0.15, 0.16, 0.15) })
      y -= 32
    }
    const qr = fieldOf(item, 'qr')
    if (qr) {
      const image = await doc.embedPng(qrPng(qr))
      page.drawImage(image, { x: 250, y: 300, width: 150, height: 150 })
      page.drawText(PDF_TEXT(fieldOf(item, 'codigo') || fieldOf(item, 'cupom')), { x: 250, y: 288, size: 8, font, color: rgb(0.45, 0.47, 0.45) })
    }
  }
  return doc.save()
}

// ——— Validação ———

export type CheckContext = {
  tipo: EventKind
  evento: string
  data: Date
  area: string
  idadeMin: number
}

function signed(parts: string[], magic: string, size: number, name: string): Check[] | null {
  if (parts[0] !== magic || parts.length !== size) {
    return [bad('Formato', `O conteúdo não é ${name} do Toki. Esperado ${size} campos separados por | começando em ${magic}.`)]
  }
  const body = parts.slice(0, -1).join('|')
  const expected = signature(body)
  if (parts[parts.length - 1] !== expected) {
    return [ok('Formato', `${name} no formato ${magic}.`), bad('Assinatura', 'A assinatura não confere: o conteúdo foi alterado depois de emitido.')]
  }
  return null
}

function eventCheck(code: string, expected: string) {
  if (!expected.trim()) return warn('Evento', `Código do evento ${code}. Informe o evento esperado para conferir.`)
  return code === expected.trim() ? ok('Evento', `Do evento ${code}.`) : bad('Evento', `É do evento ${code}, não de ${expected.trim()}.`)
}

function untilCheck(label: string, value: string, day: Date) {
  const date = parseYmd(value)
  if (!date) return bad(label, `Data de validade ilegível: ${value}.`)
  return ymd(day) <= value ? ok(label, `Válido até ${showYmd(value)}.`) : bad(label, `Venceu em ${showYmd(value)}.`)
}

function checkTicket(input: string, context: CheckContext, seen: Map<string, number>): Verdict {
  const labels = { ok: 'Entrada liberada', bad: 'Entrada barrada', warn: 'Liberar com atenção' }
  const parts = input.split('|')
  const early = signed(parts, 'MFT1', 9, 'um ingresso')
  if (early) return verdict(input, early, labels)
  const [, event, id, type, sector, seat, until, status] = parts
  const checks: Check[] = [ok('Formato', `Ingresso ${id}.`), ok('Assinatura', 'A assinatura confere.'), eventCheck(event, context.evento), untilCheck('Validade', until, context.data)]
  if (status === 'U') checks.push(bad('Status', 'Já utilizado: o ingresso passou pela catraca antes.'))
  else if (status === 'C') checks.push(bad('Status', 'Cancelado ou estornado.'))
  else checks.push(ok('Status', 'Ativo.'))
  const before = seen.get(id) ?? 0
  seen.set(id, before + 1)
  if (before > 0) checks.push(bad('Reentrada', `Este código já foi validado ${before === 1 ? 'uma vez' : `${before} vezes`} nesta conferência.`))
  if (type === 'MEIA') checks.push(warn('Meia-entrada', 'Peça o comprovante do direito à meia na entrada.'))
  else checks.push(ok('Tipo', type === 'CORTESIA' ? 'Cortesia.' : 'Inteira.'))
  checks.push(ok('Lugar', seat === '-' ? `Setor ${sector}, sem assento marcado.` : `Setor ${sector}, assento ${seat}.`))
  return verdict(input, checks, labels)
}

function checkCredential(input: string, context: CheckContext): Verdict {
  const labels = { ok: 'Acesso liberado', bad: 'Acesso barrado', warn: 'Liberar com atenção' }
  const parts = input.split('|')
  const early = signed(parts, 'MFC1', 8, 'uma credencial')
  if (early) return verdict(input, early, labels)
  const [, event, id, role, areas, until, status] = parts
  const list = areas.split('+')
  const checks: Check[] = [
    ok('Formato', `Credencial ${id} · ${role}.`),
    ok('Assinatura', 'A assinatura confere.'),
    eventCheck(event, context.evento),
    untilCheck('Validade', until, context.data),
    status === 'R' ? bad('Status', 'Revogada pela organização.') : ok('Status', 'Ativa.'),
    list.includes(context.area) ? ok('Área', `Libera ${context.area}.`) : bad('Área', `Libera ${list.join(', ')}, não ${context.area}.`),
  ]
  return verdict(input, checks, labels)
}

function checkCoupon(input: string, context: CheckContext): Verdict {
  const labels = { ok: 'Desconto aplicado', bad: 'Cupom recusado', warn: 'Cupom com ressalva' }
  const plain = /^[A-Z0-9]+-[A-Z0-9]{4}-[A-Z0-9]$/
  if (plain.test(input)) {
    const base = input.slice(0, -2)
    const digit = couponCheck(base)
    const checks: Check[] = [
      ok('Formato', 'Código de cupom digitado.'),
      input.endsWith(digit) ? ok('Dígito', 'O dígito verificador confere.') : bad('Dígito', `O dígito verificador certo seria ${digit}.`),
      warn('Vigência e usos', 'Só o código não traz vigência nem usos. Valide o QR do cupom para conferir tudo.'),
    ]
    return verdict(input, checks, labels)
  }
  const parts = input.split('|')
  const early = signed(parts, 'MFV1', 9, 'um cupom')
  if (early) return verdict(input, early, labels)
  const [, event, code, percent, start, end, limit, used] = parts
  const base = code.slice(0, -2)
  const day = ymd(context.data)
  const checks: Check[] = [
    ok('Formato', `Cupom ${code} de ${percent}%.`),
    ok('Assinatura', 'A assinatura confere.'),
    code.endsWith(couponCheck(base)) ? ok('Dígito', 'O dígito verificador confere.') : bad('Dígito', `O dígito verificador certo seria ${couponCheck(base)}.`),
    eventCheck(event, context.evento),
    day < start ? bad('Vigência', `Começa em ${showYmd(start)}.`) : day > end ? bad('Vigência', `Terminou em ${showYmd(end)}.`) : ok('Vigência', `De ${showYmd(start)} a ${showYmd(end)}.`),
    Number(used) >= Number(limit) ? bad('Usos', `Esgotado: ${used} de ${limit}.`) : ok('Usos', `${Number(limit) - Number(used)} de ${limit} restantes.`),
  ]
  return verdict(input, checks, labels)
}

function ageOn(birth: string, day: Date) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birth.trim())
  if (!match) return null
  const [, d, m, y] = match.map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getDate() !== d || date.getMonth() !== m - 1) return null
  let age = day.getFullYear() - y
  if (day.getMonth() < m - 1 || (day.getMonth() === m - 1 && day.getDate() < d)) age -= 1
  return age
}

function checkRegistration(record: Record<string, unknown>, context: CheckContext, seen: Map<string, number>): Verdict {
  const labels = { ok: 'Inscrição aceita', bad: 'Inscrição recusada', warn: 'Inscrição com pendência' }
  const text = (name: string) => String(record[name] ?? '').trim()
  const checks: Check[] = []
  const missing = ['nome', 'cpf', 'email', 'nascimento'].filter((name) => !text(name))
  checks.push(missing.length ? bad('Obrigatórios', `Faltando: ${missing.join(', ')}.`) : ok('Obrigatórios', 'Nome, CPF, e-mail e nascimento preenchidos.'))
  if (text('cpf')) checks.push(cpfValid(text('cpf')) ? ok('CPF', 'Dígitos verificadores conferem.') : bad('CPF', 'Os dígitos verificadores não conferem.'))
  if (text('email')) checks.push(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text('email')) ? ok('E-mail', 'Formato válido.') : bad('E-mail', 'Formato inválido.'))
  if (text('nascimento')) {
    const age = ageOn(text('nascimento'), context.data)
    if (age === null) checks.push(bad('Idade', 'Nascimento precisa ser uma data DD/MM/AAAA que exista.'))
    else checks.push(age >= context.idadeMin ? ok('Idade', `${age} anos.`) : bad('Idade', `${age} anos, abaixo do mínimo de ${context.idadeMin}.`))
  }
  if (text('evento')) checks.push(eventCheck(text('evento'), context.evento))
  const payment = text('pagamento')
  if (payment) checks.push(/^(pago|isento)$/i.test(payment) ? ok('Pagamento', `${payment}.`) : warn('Pagamento', `${payment}: aguarde a confirmação antes de liberar.`))
  const cpf = text('cpf').replace(/\D/g, '')
  if (cpf) {
    const before = seen.get(cpf) ?? 0
    seen.set(cpf, before + 1)
    if (before > 0) checks.push(bad('Duplicidade', 'Este CPF já apareceu antes nesta conferência.'))
  }
  const label = text('inscricao') || text('nome') || 'inscrição'
  return verdict(label, checks, labels)
}

function parseRecords(text: string): Record<string, unknown>[] | string {
  try {
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    if (!list.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return 'O JSON precisa ser um objeto ou uma lista de objetos.'
    return list as Record<string, unknown>[]
  } catch (error) {
    return `JSON inválido: ${error instanceof Error ? error.message : 'não foi possível ler'}.`
  }
}

export function validateEvents(text: string, context: CheckContext): { verdicts: Verdict[]; error?: string } {
  const trimmed = text.trim()
  if (!trimmed) return { verdicts: [], error: 'Cole ao menos um código ou envie a imagem de um QR Code.' }
  if (context.tipo === 'Inscrição') {
    const records = parseRecords(trimmed)
    if (typeof records === 'string') return { verdicts: [], error: records }
    const seen = new Map<string, number>()
    return { verdicts: records.map((record) => checkRegistration(record, context, seen)) }
  }
  const seen = new Map<string, number>()
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return {
    verdicts: lines.map((line) => {
      if (context.tipo === 'Credencial') return checkCredential(line, context)
      if (context.tipo === 'Cupom') return checkCoupon(line, context)
      return checkTicket(line, context, seen)
    }),
  }
}

