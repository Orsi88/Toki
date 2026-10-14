import JSZip from 'jszip'
import { FAM, FILE_DEF, INERT, REAL, fileInfo, fileName, fmtBytes, rng } from './mfEngine.ts'
import { buildDocument } from './documents.ts'
import { sha256 } from './export.ts'
import { mediaRequestError, realMedia, type MediaRequest } from './media.ts'

export const FILE_BYTE_LIMIT = 8 * 1024 * 1024
export const FILE_TOTAL_LIMIT = 32 * 1024 * 1024
export const FILE_COUNT_LIMIT = 100

export type FolderMode = 'raiz' | 'unica' | 'familia' | 'extensao'

export type FileRequest = MediaRequest & {
  sel: string[]
  nome: string
  nomeVar: string
  vazio: boolean
  tam: number
  unid: string
  conteudo: string
  real: string
  qtd: number
  folderMode?: FolderMode
  folderName?: string
}

export type FileArtifact = {
  filename: string
  path: string
  extension: string
  bytes: Uint8Array
  sizeBytes: number
  checksum: string
  tag: string
  tone: string
  description: string
}

export function sanitizeFolder(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'arquivos_teste'
}

export function familyName(extension: string) {
  const families = FAM as { n: string; exts: string[] }[]
  return families.find((family) => family.exts.includes(extension.toUpperCase()))?.n ?? 'Outros'
}

export function folderPreview(selected: string[], request: FileRequest) {
  if (!selected.length) return 'Nenhuma extensão selecionada.'
  type Branch = { dirs: Map<string, Branch>; files: string[] }
  const root: Branch = { dirs: new Map(), files: [] }
  const many = request.qtd > 1
  for (const extension of selected) {
    const folder = folderPath(request.folderMode ?? 'raiz', request.folderName ?? 'arquivos_teste', extension)
    let node = root
    for (const part of folder.split('/').filter(Boolean)) {
      const next = node.dirs.get(part) ?? { dirs: new Map(), files: [] }
      node.dirs.set(part, next)
      node = next
    }
    const name = fileName({ ...request }, extension, '')
    node.files.push(many ? `${name}  ×${request.qtd}` : name)
  }
  const lines: string[] = []
  const walk = (node: Branch, depth: number) => {
    for (const [name, child] of node.dirs) {
      lines.push(`${'  '.repeat(depth)}${name}/`)
      walk(child, depth + 1)
    }
    for (const file of node.files) lines.push(`${'  '.repeat(depth)}${file}`)
  }
  walk(root, 0)
  return lines.join('\n')
}

export function folderPath(mode: FolderMode, root: string, extension: string) {
  const base = sanitizeFolder(root)
  if (mode === 'raiz') return ''
  if (mode === 'unica') return base
  if (mode === 'familia') return `${base}/${sanitizeFolder(familyName(extension))}`
  return `${base}/${extension.toLowerCase()}`
}

function targetBytes(request: FileRequest) {
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
  if (!Number.isInteger(request.tam) || request.tam < 0) {
    throw new Error('O tamanho precisa ser um inteiro maior ou igual a zero.')
  }
  const bytes = request.tam * (multipliers[request.unid] ?? Number.NaN)
  if (!Number.isFinite(bytes)) throw new Error('Unidade de tamanho desconhecida.')
  if (bytes > FILE_BYTE_LIMIT) {
    throw new Error(`Cada arquivo pode ter no máximo ${fmtBytes(FILE_BYTE_LIMIT)}. O pedido foi ${fmtBytes(bytes)}.`)
  }
  return bytes
}

function randomBytes(length: number, seed: number) {
  const bytes = new Uint8Array(length)
  const random = rng(seed)
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(random() * 256)
  return bytes
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function textBytes(value: string) {
  return new TextEncoder().encode(value)
}

async function realBytes(extension: string, seed: number, name: string, request: FileRequest) {
  const ext = extension.toUpperCase()
  const media = await realMedia(ext, request)
  if (media) return media
  if (ext === 'TXT') return textBytes('MassForge\nArquivo de texto para teste de upload.\n')
  if (ext === 'EML') {
    return textBytes('From: teste@exemplo.com.br\r\nTo: qa@exemplo.com.br\r\nSubject: MassForge\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nCorpo ficticio para teste.\r\n')
  }
  if (ext === 'ZIP' || ext === 'ODT' || ext === 'ODS' || ext === 'ODP') return odfOrZip(ext, name)
  if (ext === 'PDF' || ext === 'DOCX' || ext === 'XLSX' || ext === 'PPTX') {
    const format = ext === 'PDF' ? 'PDF' : ext === 'DOCX' ? 'Word' : ext === 'XLSX' ? 'Excel' : 'PowerPoint'
    const components = format === 'Excel'
      ? [{ id: 'aba', type: 'aba', props: { nome: 'Dados', linhas: 8, colunas: 3 } }]
      : [
          { id: 'titulo', type: 'titulo', props: { texto: 'Arquivo de teste', nivel: 'H1' } },
          { id: 'paragrafo', type: 'paragrafo', props: { qtd: 1, tam: 'Curto', negrito: false, italico: false } },
        ]
    const built = await buildDocument({
      format,
      components,
      meta: { nome: name, titulo: 'Arquivo de teste', autor: 'MassForge', pagina: 'A4', orient: 'Retrato', conteudo: 'Normal' },
      seed,
    })
    return built.bytes
  }
  return null
}

async function odfOrZip(extension: string, name: string) {
  const zip = new JSZip()
  if (extension === 'ZIP') {
    zip.file('leia-me.txt', `Arquivo ${name} gerado pelo MassForge para teste.\n`)
    return zip.generateAsync({ type: 'uint8array' })
  }
  const mimeTypes: Record<string, string> = {
    ODT: 'application/vnd.oasis.opendocument.text',
    ODS: 'application/vnd.oasis.opendocument.spreadsheet',
    ODP: 'application/vnd.oasis.opendocument.presentation',
  }
  const mime = mimeTypes[extension] ?? 'application/octet-stream'
  zip.file('mimetype', mime, { compression: 'STORE' })
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:media-type="${mime}" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/></manifest:manifest>`)
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>MassForge</text:p></office:text></office:body></office:document-content>`)
  return zip.generateAsync({ type: 'uint8array' })
}

function magic(extension: string) {
  const ext = extension.toUpperCase()
  if (ext === 'PDF') return textBytes('%PDF-1.4\n')
  if (ext === 'PNG') return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (ext === 'JPG' || ext === 'JPEG') return Uint8Array.from([0xff, 0xd8, 0xff])
  if (ext === 'GIF') return textBytes('GIF89a')
  if (ext === 'WAV' || ext === 'AVI') return textBytes('RIFF')
  if (['ZIP', 'DOCX', 'XLSX', 'PPTX', 'ODT', 'ODS', 'ODP'].includes(ext)) return Uint8Array.from([0x50, 0x4b, 0x03, 0x04])
  return textBytes('')
}

function inertText(extension: string) {
  return textBytes(`MassForge fixture inerte .${extension.toLowerCase()}\nEste arquivo nao contem codigo executavel.\n`)
}

export function validateFileRequest(request: FileRequest) {
  if (!request.sel.length) return 'Selecione ao menos uma extensão.'
  if (!Number.isInteger(request.qtd) || request.qtd < 1 || request.qtd > FILE_COUNT_LIMIT) {
    return `A quantidade por extensão precisa ser um inteiro de 1 a ${FILE_COUNT_LIMIT}.`
  }
  const total = request.sel.length * request.qtd
  if (total > FILE_COUNT_LIMIT) return `O lote tem ${total} arquivos. O teto é ${FILE_COUNT_LIMIT}.`
  if (!request.vazio && request.conteudo !== 'Estrutura real' && request.conteudo !== 'Extensão divergente') {
    try {
      const bytes = targetBytes(request)
      if (bytes * total > FILE_TOTAL_LIMIT) {
        return `O lote passaria de ${fmtBytes(FILE_TOTAL_LIMIT)}. Reduza tamanho ou quantidade.`
      }
    } catch (error) {
      return error instanceof Error ? error.message : 'Tamanho inválido.'
    }
  }
  const mediaError = mediaRequestError(request, { file: FILE_BYTE_LIMIT, total: FILE_TOTAL_LIMIT })
  if (mediaError) return mediaError
  return null
}

export async function generateFiles(request: FileRequest, seed: number): Promise<FileArtifact[]> {
  const error = validateFileRequest(request)
  if (error) throw new Error(error)
  const artifacts: FileArtifact[] = []
  let running = 0
  for (const extension of request.sel) {
    for (let index = 0; index < request.qtd; index += 1) {
      const suffix = request.qtd === 1 && request.sel.length === 1 ? '' : `_${artifacts.length + 1}`
      const filename = fileName({ ...FILE_DEF, ...request }, extension, suffix)
      const folder = folderPath(request.folderMode ?? 'raiz', request.folderName ?? 'arquivos_teste', extension)
      const info = fileInfo(request, extension)
      let bytes: Uint8Array
      if (request.vazio) bytes = new Uint8Array()
      else if (request.conteudo === 'Simulado') bytes = randomBytes(targetBytes(request), seed + artifacts.length + 1)
      else if (request.conteudo === 'Corrompido') {
        const head = magic(extension)
        const size = targetBytes(request)
        if (size < head.length) throw new Error(`O tamanho pedido é menor que o cabeçalho de .${extension.toLowerCase()}.`)
        const body = randomBytes(size - head.length, seed + 1000 + artifacts.length)
        bytes = concat([head, body])
      } else if (request.conteudo === 'Extensão divergente') {
        const produced = await realBytes(request.real, seed, request.nome || 'arquivo', request)
        if (!produced) throw new Error(`Não há gerador real para o conteúdo ${request.real}.`)
        bytes = produced
      } else if ((INERT as Set<string>).has(extension)) {
        bytes = inertText(extension)
      } else if ((REAL as Set<string>).has(extension) || request.conteudo === 'Truncado' || request.conteudo === 'Estrutura real') {
        const produced = await realBytes(extension, seed + index, request.nome || 'arquivo', request)
        if (!produced) {
          bytes = concat([magic(extension), textBytes(`\nSimulado: não há gerador estrutural para .${extension.toLowerCase()}.\n`)])
        } else if (request.conteudo === 'Truncado') {
          const cut = Math.max(1, Math.floor(produced.length * 0.6))
          bytes = produced.slice(0, cut)
        } else bytes = produced
      } else {
        bytes = textBytes(`Simulado .${extension.toLowerCase()}\n`)
      }
      running += bytes.length
      if (running > FILE_TOTAL_LIMIT) {
        throw new Error(`O lote passou de ${fmtBytes(FILE_TOTAL_LIMIT)} ao montar ${filename}. Nada foi entregue pela metade.`)
      }
      artifacts.push({
        filename,
        path: folder ? `${folder}/${filename}` : filename,
        extension,
        bytes,
        sizeBytes: bytes.length,
        checksum: await sha256(bytes),
        tag: info.tag,
        tone: info.tone,
        description: request.vazio ? info.desc : `${info.desc} · ${bytes.length} bytes`,
      })
    }
  }
  return artifacts
}

export async function zipArtifacts(artifacts: FileArtifact[]) {
  const zip = new JSZip()
  const used = new Set<string>()
  for (const artifact of artifacts) {
    const slash = (artifact.path || artifact.filename).lastIndexOf('/')
    const folder = slash >= 0 ? artifact.path.slice(0, slash + 1) : ''
    let name = artifact.filename
    let index = 2
    while (used.has(`${folder}${name}`.toLocaleLowerCase('pt-BR'))) {
      const dot = artifact.filename.lastIndexOf('.')
      name = `${artifact.filename.slice(0, dot)}_${index}${artifact.filename.slice(dot)}`
      index += 1
    }
    const entry = `${folder}${name}`
    used.add(entry.toLocaleLowerCase('pt-BR'))
    zip.file(entry, artifact.bytes)
  }
  return zip.generateAsync({ type: 'uint8array' })
}

export { fmtBytes }
