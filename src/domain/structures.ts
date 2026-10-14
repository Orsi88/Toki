import { barsSvg, brokenQrSvg, encodeCode128, encodeEan13, qrSvg, type QrEcc } from './symbols.ts'

export type Structured = { code: string; tag: string; tone: string; info: string; svg?: string }

const CLASSIC = new Set(['JSON', 'XML', 'CSV', 'YAML', 'SQL'])

function text(value: unknown, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

function whole(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) ? number : Number.NaN
}

function fail(message: string): Structured {
  return { code: '', tag: 'configuração incompatível', tone: 'warn', info: message }
}

function randomDigits(random: () => number, count: number) {
  let out = ''
  for (let index = 0; index < count; index += 1) out += String(Math.floor(random() * 10))
  return out
}

function barcodeOne(config: Record<string, unknown>, random: () => number) {
  const symbology = text(config.simbologia, 'EAN-13')
  const rule = text(config.regraCodigo, 'Válido')
  const informed = text(config.conteudoModo) === 'Informado'
  const raw = informed
    ? text(config.conteudo).trim()
    : symbology === 'EAN-13'
      ? randomDigits(random, 12)
      : `MF${randomDigits(random, 6)}`
  if (rule === 'Conteúdo incompatível') {
    const sample = informed && raw ? raw : (symbology === 'EAN-13' ? 'ABC' : 'ação')
    const attempt = symbology === 'Code 128' ? encodeCode128(sample, false) : encodeEan13(sample, false)
    if (!attempt.error) {
      return {
        payload: sample,
        svg: '',
        tag: 'configuração incompatível',
        tone: 'warn',
        info: `"${sample}" cabe em ${symbology}. Informe um conteúdo que essa simbologia recuse.`,
      }
    }
    return { payload: sample, svg: '', tag: 'conteúdo incompatível', tone: 'bad', info: attempt.error }
  }
  const badCheck = rule === 'Dígito verificador incorreto'
  if (symbology === 'Code 128') {
    const encoded = encodeCode128(raw, badCheck)
    if (encoded.error) return { payload: raw, svg: '', tag: 'conteúdo incompatível', tone: 'bad', info: encoded.error }
    return {
      payload: raw,
      svg: barsSvg(encoded.bits, raw),
      tag: badCheck ? 'dígito verificador incorreto' : 'código válido',
      tone: badCheck ? 'bad' : 'ok',
      info: badCheck
        ? `Code 128 de "${raw}" com o verificador trocado. Os dados continuam no símbolo; a conferência do dígito falha.`
        : `Code 128 conjunto B de "${raw}".`,
    }
  }
  const encoded = encodeEan13(raw, badCheck)
  if (encoded.error) return { payload: raw, svg: '', tag: 'conteúdo incompatível', tone: 'bad', info: encoded.error }
  return {
    payload: encoded.text,
    svg: barsSvg(encoded.bits, encoded.text),
    tag: badCheck ? 'dígito verificador incorreto' : 'código válido',
    tone: badCheck ? 'bad' : 'ok',
    info: badCheck
      ? `EAN-13 ${encoded.text} com o verificador trocado de propósito. O símbolo existe; a conta do dígito não fecha.`
      : `EAN-13 ${encoded.text} com dígito verificador correto.`,
  }
}

function barcodes(config: Record<string, unknown>, random: () => number): Structured {
  const count = whole(config.qtdCodigos)
  if (count < 1 || count > 20) return fail('A quantidade de códigos precisa ser um inteiro de 1 a 20.')
  const rows = Array.from({ length: count }, () => barcodeOne(config, random))
  const first = rows[0]
  return {
    code: rows.map((row) => row.payload).join('\n'),
    svg: first.svg || undefined,
    tag: first.tag,
    tone: first.tone,
    info: count === 1 ? first.info : `${first.info} A imagem é o primeiro de ${count}. O texto lista todos os conteúdos.`,
  }
}

function qrCodes(config: Record<string, unknown>, random: () => number): Structured {
  const count = whole(config.qtdCodigos)
  const size = whole(config.lado)
  const margin = whole(config.margem)
  const ecc = text(config.ecc, 'M') as QrEcc
  if (count < 1 || count > 20) return fail('A quantidade de códigos precisa ser um inteiro de 1 a 20.')
  if (size < 64 || size > 512) return fail('O lado do QR precisa ser um inteiro de 64 a 512.')
  if (margin < 0 || margin > 10) return fail('A margem do QR precisa ser um inteiro de 0 a 10.')
  if (!['L', 'M', 'Q', 'H'].includes(ecc)) return fail('A correção de erro do QR precisa ser L, M, Q ou H.')
  const mode = text(config.conteudoModo, 'Texto')
  const rule = text(config.regraQr, 'Válido')
  const payloads = Array.from({ length: count }, () => {
    if (rule === 'Payload recusado') return text(config.conteudo).trim() || (mode === 'URL' ? 'nota url' : 'rejeitado pelo destino')
    if (mode === 'Informado') return text(config.conteudo).trim()
    if (mode === 'URL') return `https://exemplo.com/item/${randomDigits(random, 4)}`
    return `massa ${randomDigits(random, 6)}`
  })
  if (payloads.some((payload) => !payload)) return fail('Informe o conteúdo do QR.')
  if (rule === 'Imagem ilegível') {
    return {
      code: payloads.join('\n'),
      svg: brokenQrSvg(size),
      tag: 'imagem ilegível',
      tone: 'bad',
      info: 'A imagem não é um QR decodificável. O texto é o conteúdo pedido, não o que um leitor enxerga.',
    }
  }
  const refused = rule === 'Payload recusado'
  let svg = ''
  try {
    svg = qrSvg(payloads[0], size, margin, ecc)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Não foi possível montar o QR.')
  }
  return {
    code: payloads.join('\n'),
    svg,
    tag: refused ? 'payload recusado' : 'QR válido',
    tone: refused ? 'bad' : 'ok',
    info: refused
      ? `O QR é legível e a correção é ${ecc}. O conteúdo é um payload recusado pelo destino, não uma imagem quebrada.`
      : `QR ${ecc}, margem ${margin}, lado ${size}. O texto ao lado é o conteúdo codificado.`,
  }
}

function listPayload(config: Record<string, unknown>): Structured {
  const count = whole(config.itens)
  if (count < 1 || count > 100) return fail('A lista precisa de 1 a 100 itens.')
  const long = text(config.rotulo) === 'Longo'
  const rule = text(config.regraLista, 'Válido')
  const items = Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    rotulo: long ? `Item de teste com nome bem longo número ${index + 1}` : `Item ${index + 1}`,
  }))
  let tag = 'lista válida'
  let tone = 'ok'
  let info = 'Ids únicos e rótulos preenchidos.'
  if (rule === 'Repetidos' && items.length > 1) {
    items[items.length - 1].id = items[0].id
    tag = 'id repetido'
    tone = 'bad'
    info = `O id ${items[0].id} aparece duas vezes de propósito.`
  } else if (rule === 'Valores vazios') {
    items[items.length - 1].rotulo = ''
    tag = 'valor vazio'
    tone = 'bad'
    info = 'O último rótulo está vazio de propósito. O id continua presente.'
  }
  return { code: JSON.stringify(items, null, 2), tag, tone, info }
}

type FlatNode = { id: string; nome: string; pai: string | null; filhos?: FlatNode[] }

function hierarchy(config: Record<string, unknown>): Structured {
  const levels = whole(config.niveis)
  const children = whole(config.filhos)
  if (levels < 2 || levels > 4) return fail('Os níveis precisam ser um inteiro de 2 a 4.')
  if (children < 1 || children > 4) return fail('Os filhos por nível precisam ser um inteiro de 1 a 4.')
  const rows: FlatNode[] = [{ id: 'n1', nome: 'Raiz', pai: null }]
  let parents = ['n1']
  for (let level = 2; level <= levels; level += 1) {
    const next: string[] = []
    for (const parent of parents) {
      for (let child = 1; child <= children; child += 1) {
        const id = `${parent}-${child}`
        rows.push({ id, nome: `Nível ${level} · ${child}`, pai: parent })
        next.push(id)
      }
    }
    parents = next
  }
  const rule = text(config.regraHier, 'Válido')
  const nested = text(config.saida, 'Aninhada') === 'Aninhada'
  const warnings: string[] = []
  if (rule === 'ID duplicado' && rows.length > 1) {
    warnings.push(`O id ${rows[0].id} foi repetido no registro "${rows[1].nome}".`)
    rows[1].id = rows[0].id
  } else if (rule === 'Pai ausente') {
    warnings.push(`"${rows[rows.length - 1].nome}" aponta para o pai nao-existe, que não está na massa.`)
    rows[rows.length - 1].pai = 'nao-existe'
  } else if (rule === 'Referência circular') {
    if (nested) return fail('Referência circular não cabe numa saída aninhada. Escolha a saída plana.')
    if (rows.length >= 3) {
      rows[1].pai = rows[2].id
      rows[2].pai = rows[1].id
      warnings.push(`${rows[1].id} aponta para ${rows[2].id}, e ${rows[2].id} aponta de volta.`)
    }
  }
  const ids = rows.map((row) => row.id)
  if (rule === 'Válido') {
    const unique = new Set(ids)
    if (unique.size !== ids.length) warnings.push('Há id duplicado.')
    for (const row of rows) {
      if (row.pai && !ids.includes(row.pai)) warnings.push(`${row.id} aponta para um pai ausente.`)
    }
  }
  const flat = rows.map(({ id, nome, pai }) => ({ id, nome, pai }))
  const payload = warnings.length
    ? { regra: rule, avisos: warnings, registros: flat, ...(nested ? { arvore: nest(rows) } : {}) }
    : nested ? nest(rows) : flat
  const broken = rule !== 'Válido' || warnings.length > 0
  return {
    code: JSON.stringify(payload, null, 2),
    tag: broken ? rule.toLowerCase() : nested ? 'hierarquia aninhada' : 'hierarquia plana',
    tone: broken ? 'bad' : 'ok',
    info: broken ? `${warnings.join(' ')}${nested ? ' Os registros planos mostram a falha; a árvore é a leitura aninhada.' : ''}` : nested
      ? 'Ids únicos e cada filho aponta para um pai que existe.'
      : 'Registros planos com id, nome e pai. Ids únicos e pais existentes.',
  }
}

function nest(rows: FlatNode[]) {
  const nodes = new Map<string, FlatNode>()
  for (const row of rows) {
    if (!nodes.has(row.id)) nodes.set(row.id, { id: row.id, nome: row.nome, pai: row.pai, filhos: [] })
  }
  const roots: FlatNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)
    if (!node) continue
    const parent = row.pai ? nodes.get(row.pai) : undefined
    if (parent && parent !== node) parent.filhos?.push(node)
    else if (!roots.includes(node)) roots.push(node)
  }
  return roots
}

function series(config: Record<string, unknown>, random: () => number): Structured {
  const points = whole(config.pontos)
  const seriesCount = whole(config.seriesQtd)
  const places = whole(config.casasSerie)
  const lo = Number(config.intervaloMin)
  const hi = Number(config.intervaloMax)
  if (points < 1 || points > 100) return fail('A série precisa de 1 a 100 pontos.')
  if (seriesCount < 1 || seriesCount > 3) return fail('Use de 1 a 3 séries.')
  if (places < 0 || places > 4) return fail('As casas da série precisam ser um inteiro de 0 a 4.')
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return fail('O intervalo da série precisa ser numérico.')
  if (lo > hi) return fail('O mínimo da série está acima do máximo.')
  const pattern = text(config.padrao, 'Crescimento')
  const dates = text(config.catTipo, 'Categorias') === 'Datas'
  if (pattern === 'Datas fora de ordem' && !dates) return fail('Datas fora de ordem pedem a sequência de datas.')
  if (pattern === 'Categorias repetidas' && dates) return fail('Categorias repetidas pedem categorias, não datas.')
  const long = text(config.rotulo) === 'Longo'
  const labels = categories(points, dates, long, pattern)
  const span = hi - lo
  const rows = labels.map((label, index) => {
    const row: Record<string, string | number | null> = { categoria: label }
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
      row[`serie_${seriesIndex + 1}`] = seriesPoint(pattern, index, points, lo, hi, span, places, random)
    }
    return row
  })
  const csv = text(config.saidaSerie) === 'CSV'
  const zero = pattern === 'Zeros'
  const missing = pattern === 'Ausentes'
  const info = missing
    ? 'Ausente é null no JSON e célula vazia no CSV. Não é o número zero.'
    : zero
      ? 'Zero é um valor presente, diferente de uma célula ausente.'
      : pattern === 'Negativos'
        ? 'Os valores são negativos de propósito, mesmo quando o intervalo configurado é positivo.'
        : pattern === 'Categorias repetidas'
          ? 'A última categoria repete a primeira.'
          : pattern === 'Datas fora de ordem'
            ? 'A primeira data foi trocada com a última.'
            : `Padrão ${pattern.toLowerCase()} dentro de ${lo} a ${hi}.`
  const negative = ['Negativos', 'Zeros', 'Ausentes', 'Categorias repetidas', 'Datas fora de ordem'].includes(pattern)
  return {
    code: csv ? toCsv(rows) : JSON.stringify(rows, null, 2),
    tag: pattern.toLowerCase(),
    tone: negative ? 'bad' : 'ok',
    info,
  }
}

function categories(count: number, dates: boolean, long: boolean, pattern: string) {
  if (dates) {
    const start = new Date(Date.UTC(2026, 0, 1))
    const labels = Array.from({ length: count }, (_, index) => {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      return date.toISOString().slice(0, 10)
    })
    if (pattern === 'Datas fora de ordem' && labels.length > 1) {
      const first = labels[0]
      labels[0] = labels[labels.length - 1]
      labels[labels.length - 1] = first
    }
    return labels
  }
  const labels = Array.from({ length: count }, (_, index) => (
    long ? `Categoria de teste com nome bem longo ${index + 1}` : `Cat ${index + 1}`
  ))
  if (pattern === 'Categorias repetidas' && labels.length > 1) labels[labels.length - 1] = labels[0]
  return labels
}

function seriesPoint(
  pattern: string,
  index: number,
  total: number,
  lo: number,
  hi: number,
  span: number,
  places: number,
  random: () => number,
) {
  if (pattern === 'Zeros') return 0
  if (pattern === 'Ausentes') return null
  const t = total <= 1 ? 0 : index / (total - 1)
  let value = lo + span * t
  if (pattern === 'Queda') value = hi - span * t
  else if (pattern === 'Constante') value = lo + span / 2
  else if (pattern === 'Picos') value = index % 5 === 4 ? hi : lo + span * 0.35
  else if (pattern === 'Negativos') value = -Math.abs(lo + span * t || 1)
  else if (!['Crescimento', 'Categorias repetidas', 'Datas fora de ordem'].includes(pattern)) value = lo + random() * span
  return Number(value.toFixed(places))
}

function toCsv(rows: Record<string, string | number | null>[]) {
  const columns = Object.keys(rows[0] ?? { categoria: '' })
  const cell = (value: string | number | null) => {
    if (value === null || value === undefined) return ''
    const shown = String(value)
    return /[",\n]/.test(shown) ? `"${shown.replace(/"/g, '""')}"` : shown
  }
  return [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n')
}

export function buildStructured(config: Record<string, unknown>, random: () => number): Structured | null {
  const format = text(config.formato, 'JSON')
  if (CLASSIC.has(format)) return null
  if (format === 'Código de barras') return barcodes(config, random)
  if (format === 'QR Code') return qrCodes(config, random)
  if (format === 'Lista') return listPayload(config)
  if (format === 'Hierarquia') return hierarchy(config)
  if (format === 'Série') return series(config, random)
  return fail(`Formato ${format} ainda não tem gerador.`)
}
