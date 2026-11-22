// Motor do Toki empacotado para a extensão (npm run build:extension → dist-extension/engine.js).
// A extensão usa os mesmos geradores da Massa Personalizada; não existe um segundo motor.
import { COLUMN_TYPES, defaultExtra, generateCustom, type CustomColumn } from '../domain/custom.ts'
import { generateFiles, type FileRequest } from '../domain/files.ts'
import { setWatermarkSource } from '../domain/documents.ts'
import watermarkPng from '../../public/imagens/marca-dagua-bloco-512x512-verde-claro-transparente.png?inline'
import watermarkJpg from '../../public/imagens/marca-dagua-bloco-512x512-verde-claro-fundo-branco.jpg?inline'
import { FAM, FILE_DEF, REAL } from '../domain/mfEngine.ts'

export type Rule = 'Válido' | 'Inválido'

/** Tipos que fazem sentido sozinhos num campo (lista e cópia dependem de configuração). */
export const TYPES = COLUMN_TYPES.filter((type) => type !== 'Lista de opções' && type !== 'Cópia de outra coluna')

export const PERSON = ['Nome completo', 'CPF', 'Data de nascimento', 'E-mail', 'Telefone', 'CEP', 'Endereço', 'Cidade', 'UF'] as const

function seed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Um valor de um tipo, com o rótulo de validade que o gerador atribuiu. */
export function one(type: string, rule: Rule = 'Válido') {
  const column: CustomColumn = { id: 'v', name: 'v', type, rule, extra: defaultExtra(type) }
  const [row] = generateCustom({ columns: [column], count: 1, seed: seed(), referenceDate: new Date(), consistent: false })
  return { value: row.values.v, ok: row.checks.v === 'passa' }
}

/** Uma pessoa coerente: nome, CPF da UF, e-mail e endereço saem da mesma pessoa. */
export function person(rule: Rule = 'Válido') {
  const columns = PERSON.map((type) => ({ id: type, name: type, type, rule }))
  const [row] = generateCustom({ columns, count: 1, seed: seed(), referenceDate: new Date(), consistent: true })
  return PERSON.map((type) => ({ type, value: row.values[type], ok: row.checks[type] === 'passa' }))
}

/** Uma linha para preencher um formulário capturado, respeitando opções, limites e vínculos. */
export function row(columns: CustomColumn[]) {
  const [record] = generateCustom({ columns, count: 1, seed: seed(), referenceDate: new Date(), consistent: true })
  return record
}

// ---------- Arquivos de exemplo para campos de upload (mesmo gerador da categoria Arquivos) ----------
// Dentro de outra página não existe /imagens/: a marca d'água dos documentos vai embutida no motor.
const fromDataUrl = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (char) => char.charCodeAt(0))
setWatermarkSource((file) => (file.endsWith('.png') ? fromDataUrl(watermarkPng) : file.endsWith('.jpg') ? fromDataUrl(watermarkJpg) : undefined))

const KNOWN = new Set<string>((FAM as { exts: string[] }[]).flatMap((family) => family.exts.map((ext) => ext.toUpperCase())))
const BY_MIME: Record<string, string> = {
  'image/*': 'PNG', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/jpg': 'JPG', 'image/gif': 'GIF',
  'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/csv': 'CSV', 'application/zip': 'ZIP',
  'audio/*': 'WAV', 'audio/wav': 'WAV', 'video/*': 'AVI',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/msword': 'DOC', 'application/vnd.ms-excel': 'XLS',
}
const MIME: Record<string, string> = Object.fromEntries(Object.entries(BY_MIME).filter(([mime]) => !mime.endsWith('*')).map(([mime, ext]) => [ext, mime]))

/** Extensões que o atributo accept do campo pede, na ordem; vazio quando o campo aceita qualquer arquivo. */
export function acceptedExtensions(accept: string) {
  return accept.split(',').map((token) => token.trim().toLowerCase()).filter(Boolean).map((token) => {
    if (token.startsWith('.')) return token.slice(1).toUpperCase()
    return BY_MIME[token] ?? (token.startsWith('image/') ? 'PNG' : token.startsWith('audio/') ? 'WAV' : token.startsWith('video/') ? 'AVI' : '')
  }).filter((ext) => ext && KNOWN.has(ext))
}

/** Escolhe o arquivo: válido = o primeiro tipo aceito (PDF se aceita qualquer um); inválido = um tipo fora do accept, ou PDF corrompido. */
export function pickSample(accept: string, valid: boolean) {
  const wanted = acceptedExtensions(accept)
  if (valid) return { ext: wanted[0] ?? 'PDF', corrupt: false }
  const outside = ['TXT', 'PDF', 'PNG'].find((ext) => !wanted.includes(ext))
  return wanted.length && outside ? { ext: outside, corrupt: false } : { ext: 'PDF', corrupt: true }
}

/** Gera um arquivo de exemplo pequeno (estrutura real quando o Toki sabe montar o formato). */
export async function sampleFile(accept: string, valid = true) {
  const { ext, corrupt } = pickSample(accept, valid)
  const request = {
    ...FILE_DEF, sel: [ext], qtd: 1, tam: 20, unid: 'KB', nome: 'arquivo_teste',
    conteudo: corrupt ? 'Corrompido' : (REAL as Set<string>).has(ext) ? 'Estrutura real' : 'Simulado',
  } as unknown as FileRequest
  const [file] = await generateFiles(request, seed())
  return { name: file.filename, bytes: file.bytes, type: MIME[ext] ?? 'application/octet-stream', ext, corrupt }
}
