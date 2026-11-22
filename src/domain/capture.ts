import { COLUMN_TYPES, DATE_TYPES, dependencyOrder, type ColumnExtra, type CustomColumn } from './custom.ts'

// Contrato da extensão Captura Inteligente (extension/). A extensão só descreve a estrutura do
// formulário; quem valida e gera é o Toki. O payload chega no fragmento da URL (#/massa?captura=...),
// que nunca vai a servidor, e só é aplicado depois que a pessoa confirma na Massa Personalizada.
export const CAPTURE_SCHEMA = '1.0'
export const CAPTURE_SOURCE = 'toki-browser-extension'
export const MAX_CAPTURE_FIELDS = 200
export const MAX_CAPTURE_PARAM = 120_000

export type CaptureField = {
  id: string
  name: string
  label: string
  controlType: string
  required: boolean
  constraints: { minLength?: number; maxLength?: number; min?: number; max?: number; step?: string; pattern?: string }
  options?: string[]
  /** ref: id do campo copiado (Cópia de outra coluna); after: id do campo de data anterior. */
  generator: { type: string; valid: boolean; ref?: string; after?: string }
  confidence: number
  source: string
  hint?: string
}

export type CaptureImport = {
  captureId: string
  formName: string
  columns: CustomColumn[]
  notes: { column: string; text: string }[]
}

const TYPES = new Set<string>(COLUMN_TYPES)

function clean(value: unknown, max = 120) {
  // React escapa o texto ao renderizar; aqui só removemos caracteres de controle e limitamos o tamanho.
  // oxlint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function num(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function decodeCapture(param: string): unknown {
  if (param.length > MAX_CAPTURE_PARAM) throw new Error('A captura é grande demais para importar.')
  const base64 = param.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function encodeCapture(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function parseCapture(raw: unknown): CaptureImport | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'A captura não é um objeto válido.' }
  const data = raw as Record<string, unknown>
  if (data.source !== CAPTURE_SOURCE) return { error: 'A captura não veio da extensão do Toki.' }
  if (data.schemaVersion !== CAPTURE_SCHEMA) return { error: `Versão de captura ${clean(data.schemaVersion) || 'desconhecida'} não suportada; atualize a extensão ou o Toki.` }
  const form = data.form as Record<string, unknown> | undefined
  const fields = form?.fields
  if (!form || !Array.isArray(fields)) return { error: 'A captura não tem a lista de campos.' }
  if (fields.length === 0) return { error: 'A captura não tem nenhum campo.' }
  if (fields.length > MAX_CAPTURE_FIELDS) return { error: `A captura tem ${fields.length} campos; o limite é ${MAX_CAPTURE_FIELDS}.` }

  const columns: CustomColumn[] = []
  const notes: CaptureImport['notes'] = []
  const used = new Set<string>()
  const idOf = new Map<string, string>()
  const links: { column: CustomColumn; key: 'ref' | 'after'; target: string }[] = []
  fields.forEach((item, index) => {
    const field = (item && typeof item === 'object' ? item : {}) as Partial<CaptureField>
    const label = clean(field.label)
    // Nome legível (o label que a extensão mandou); repetidos ganham " (2)", sem diferenciar maiúsculas.
    const base = clean(field.name, 80) || label.slice(0, 80) || `campo_${index + 1}`
    let name = base
    for (let n = 2; used.has(name.toLocaleLowerCase('pt-BR')); n += 1) name = `${base} (${n})`
    used.add(name.toLocaleLowerCase('pt-BR'))
    const note = (text: string) => notes.push({ column: name, text })

    const asked = clean(field.generator?.type, 40)
    let type = TYPES.has(asked) ? asked : 'Texto curto'
    if (!TYPES.has(asked)) note(`Tipo "${asked || 'vazio'}" não existe no Toki; ficou Texto curto.`)

    const constraints = (field.constraints && typeof field.constraints === 'object' ? field.constraints : {}) as CaptureField['constraints']
    const extra: ColumnExtra = {}
    if (type === 'Lista de opções') {
      const options = (Array.isArray(field.options) ? field.options : []).map((option) => clean(option)).filter(Boolean).slice(0, 200)
      if (options.length) extra.options = options
      else {
        type = 'Texto curto'
        note('Lista sem opções; ficou Texto curto.')
      }
    }
    const copies = type === 'Cópia de outra coluna'
    const min = num(constraints.min)
    const max = num(constraints.max)
    const maxLength = num(constraints.maxLength)
    if (type === 'Número inteiro') {
      if (min !== undefined && Number.isInteger(min)) extra.min = min
      if (max !== undefined && Number.isInteger(max)) extra.max = max
      if (extra.min !== undefined && extra.max !== undefined && extra.min > extra.max) {
        delete extra.min
        delete extra.max
        note('Mínimo acima do máximo no formulário; limites descartados.')
      }
    } else if (!copies && (min !== undefined || max !== undefined)) note(`Limites ${min ?? '…'} a ${max ?? '…'} registrados, mas o gerador de ${type} não os aplica.`)
    if (type === 'Texto curto' && maxLength !== undefined && Number.isInteger(maxLength) && maxLength >= 1 && maxLength <= 10000) extra.maxLength = maxLength
    else if (!copies && maxLength !== undefined) note(`Tamanho máximo ${maxLength} registrado, mas o gerador de ${type} não o aplica.`)
    if (!copies && num(constraints.minLength) !== undefined) note(`Tamanho mínimo ${constraints.minLength} não é aplicado pelo gerador.`)
    if (!copies && clean(constraints.pattern, 200)) note(`Padrão ${clean(constraints.pattern, 200)} não é aplicado pelo gerador; confira os valores.`)
    const confidence = num(field.confidence) ?? 0
    if (confidence < 0.6) note(`Reconhecimento incerto (${Math.round(confidence * 100)}%); confira o tipo.`)
    const hint = clean(field.hint, 200)
    if (hint) note(hint)

    const column: CustomColumn = { id: `cap-${index + 1}-${Date.now().toString(36)}`, name, type, rule: 'Válido', extra }
    idOf.set(clean(field.id, 64) || `field-${index + 1}`, column.id)
    const ref = clean(field.generator?.ref, 64)
    const after = clean(field.generator?.after, 64)
    if (copies) links.push({ column, key: 'ref', target: ref })
    else if (after && (type === 'Data' || type === 'Data e hora')) links.push({ column, key: 'after', target: after })
    columns.push(column)
  })

  // Vínculos chegam pelos ids da captura; aqui viram ids de coluna. Vínculo que não fecha é desfeito com aviso.
  const byId = new Map(columns.map((column) => [column.id, column]))
  for (const link of links) {
    const target = idOf.get(link.target)
    const ok = target && target !== link.column.id && (link.key === 'ref' || DATE_TYPES.includes(byId.get(target)!.type))
    if (ok) link.column.extra![link.key] = target
    else if (link.key === 'ref') {
      link.column.type = 'Texto curto'
      notes.push({ column: link.column.name, text: 'A coluna a copiar não veio na captura; ficou Texto curto.' })
    } else notes.push({ column: link.column.name, text: 'A data de origem não veio na captura; vínculo desfeito.' })
  }
  try {
    dependencyOrder(columns)
  } catch {
    for (const column of columns) {
      if (column.extra?.ref) { column.type = 'Texto curto'; delete column.extra.ref }
      delete column.extra?.after
    }
    notes.push({ column: columns[0].name, text: 'Os vínculos da captura formavam um ciclo e foram desfeitos.' })
  }
  for (const column of columns) {
    if (column.extra?.ref) notes.push({ column: column.name, text: `Copia a coluna ${byId.get(column.extra.ref)!.name}.` })
    if (column.extra?.after) notes.push({ column: column.name, text: `Sai depois de ${byId.get(column.extra.after)!.name}.` })
    if (column.extra && Object.keys(column.extra).length === 0) delete column.extra
  }
  return { captureId: clean(data.captureId, 64), formName: clean(form.name) || 'Formulário capturado', columns, notes }
}
