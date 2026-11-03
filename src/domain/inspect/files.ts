import JSZip from 'jszip'
import { PDFDict, PDFDocument, PDFStream } from 'pdf-lib'
import { sha256 } from '../export.ts'
import { checkCsv, checkJson, checkXml } from './structured.ts'
import { bad, ok, verdict, warn, type Check, type Verdict } from './verdict.ts'

// O investigador de arquivos: descobre o tipo pelo conteúdo, não pelo nome, confere a estrutura
// de cada formato e procura conteúdo ativo (macro, script, executável, objeto embutido).

export type InFile = { name: string; bytes: Uint8Array }

// O investigador não aprova nem reprova: quem decide é quem sabe para que o arquivo serve. Ele só diz o que achou.
const LABELS = { ok: 'Nada a observar', bad: 'Pede atenção', warn: 'Com observações' }

function report(name: string, checks: Check[]): Verdict {
  const found = [...new Set(checks.filter((check) => check.tone !== 'ok').map((check) => check.label.toLocaleLowerCase('pt-BR')))]
  return { ...verdict(name, checks, LABELS), summary: found.length ? `Encontrado: ${found.join(', ')}.` : 'Nada fora do comum.' }
}

const DANGEROUS = new Set(['EXE', 'DLL', 'SCR', 'COM', 'PIF', 'CPL', 'MSI', 'MSP', 'BAT', 'CMD', 'VBS', 'VBE', 'JS', 'JSE', 'WSF', 'WSH', 'PS1', 'HTA', 'LNK', 'JAR', 'APPLICATION', 'GADGET', 'REG', 'SYS'])

// Extensão → tipos de conteúdo aceitos. Os pacotes Office/ODF são ZIP e são refinados pelo que há dentro.
const EXPECTED: Record<string, string[]> = {
  PDF: ['pdf'], PNG: ['png'], JPG: ['jpeg'], JPEG: ['jpeg'], GIF: ['gif'], BMP: ['bmp'], WEBP: ['webp'],
  WAV: ['wav'], AVI: ['avi'], MP3: ['mp3'], MP4: ['mp4'], M4A: ['mp4'], MOV: ['mp4'],
  ZIP: ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'jar', 'apk'], RAR: ['rar'], '7Z': ['7z'], GZ: ['gzip'], TGZ: ['gzip'],
  DOCX: ['docx', 'encrypted'], DOCM: ['docx', 'encrypted'], XLSX: ['xlsx', 'encrypted'], XLSM: ['xlsx', 'encrypted'], PPTX: ['pptx', 'encrypted'], PPTM: ['pptx', 'encrypted'],
  ODT: ['odt'], ODS: ['ods'], ODP: ['odp'], JAR: ['jar'], APK: ['apk'], GADGET: ['zip'],
  DOC: ['ole'], XLS: ['ole'], PPT: ['ole'], MSG: ['ole'], MSI: ['ole'], MSP: ['ole'],
  EXE: ['exe'], DLL: ['exe'], SCR: ['exe'], COM: ['exe'], PIF: ['exe'], CPL: ['exe'], SYS: ['exe'],
  TXT: ['text'], CSV: ['text'], LOG: ['text'], MD: ['text'], JSON: ['text'], XML: ['text'], HTML: ['text'], HTM: ['text'],
  SVG: ['text'], EML: ['text'], YAML: ['text'], YML: ['text'], SQL: ['text'], BAT: ['text'], CMD: ['text'], VBS: ['text'],
  JS: ['text'], PS1: ['text'], HTA: ['text'], REG: ['text'], APPLICATION: ['text'], RTF: ['rtf'],
}

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF', png: 'PNG', jpeg: 'JPEG', gif: 'GIF', bmp: 'BMP', webp: 'WebP', wav: 'WAV', avi: 'AVI', mp3: 'MP3', mp4: 'MP4/MOV',
  zip: 'ZIP', docx: 'Word (DOCX)', xlsx: 'Excel (XLSX)', pptx: 'PowerPoint (PPTX)', odt: 'OpenDocument texto', ods: 'OpenDocument planilha',
  odp: 'OpenDocument apresentação', jar: 'Java (JAR)', apk: 'Android (APK)', rar: 'RAR', '7z': '7-Zip', gzip: 'GZIP',
  ole: 'Office antigo / OLE', encrypted: 'Office com senha (criptografado)', exe: 'Executável Windows (PE)', elf: 'Executável Linux (ELF)', rtf: 'RTF', text: 'Texto', binary: 'Binário desconhecido', empty: 'Vazio',
}

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)))
const u16le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8)
const u32le = (bytes: Uint8Array, at: number) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
const u32be = (bytes: Uint8Array, at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
const starts = (bytes: Uint8Array, signature: number[], at = 0) => signature.every((value, index) => bytes[at + index] === value)
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1).replace('.', ',')} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`

function latin1(bytes: Uint8Array) {
  let out = ''
  for (let index = 0; index < bytes.length; index += 0x8000) out += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return out
}

export function sniff(bytes: Uint8Array) {
  if (!bytes.length) return 'empty'
  if (ascii(bytes, 0, 1024).includes('%PDF-')) return 'pdf'
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'gif'
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const form = ascii(bytes, 8, 12)
    if (form === 'WAVE') return 'wav'
    if (form === 'AVI ') return 'avi'
    if (form === 'WEBP') return 'webp'
  }
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length > 26) return 'bmp'
  if (ascii(bytes, 4, 8) === 'ftyp') return 'mp4'
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && bytes.length > 4)) return 'mp3'
  if (starts(bytes, [0x50, 0x4b]) && [0x0304, 0x0506, 0x0708].includes((bytes[2] << 8) | bytes[3])) return 'zip'
  if (ascii(bytes, 0, 6) === 'Rar!\x1a\x07') return 'rar'
  if (starts(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z'
  if (starts(bytes, [0x1f, 0x8b])) return 'gzip'
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole'
  if (ascii(bytes, 0, 2) === 'MZ') return 'exe'
  if (starts(bytes, [0x7f, 0x45, 0x4c, 0x46])) return 'elf'
  if (ascii(bytes, 0, 5) === '{\\rtf') return 'rtf'
  const head = bytes.subarray(0, 4096)
  if (head.includes(0)) return 'binary'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, head.length - 3))
    return 'text'
  } catch {
    return head.every((value) => value === 9 || value === 10 || value === 13 || value >= 32) ? 'text' : 'binary'
  }
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : ''
}

function nameChecks(name: string): Check[] {
  const checks: Check[] = []
  const parts = name.split('.')
  const last = extensionOf(name)
  if (parts.length > 2) {
    const inner = parts[parts.length - 2].toUpperCase()
    if (EXPECTED[inner] && DANGEROUS.has(last)) checks.push(bad('Nome', `Dupla extensão: parece .${inner.toLowerCase()}, mas é .${last.toLowerCase()}. Truque comum para esconder executável.`))
    else if (EXPECTED[inner]) checks.push(warn('Nome', `Dupla extensão (.${inner.toLowerCase()}.${last.toLowerCase()}). Vale a extensão final.`))
  }
  if (!checks.length && DANGEROUS.has(last)) checks.push(warn('Nome', `.${last.toLowerCase()} é uma extensão que executa código. Sistemas de upload costumam bloquear.`))
  if (!last) checks.push(warn('Nome', 'Arquivo sem extensão.'))
  if (name.length > 255) checks.push(warn('Nome', `${name.length} caracteres: passa do limite de 255 da maioria dos sistemas de arquivos.`))
  if (/[<>:"\\|?*\u0000-\u001f]/.test(name)) checks.push(warn('Nome', 'Caracteres que o Windows não aceita em nome de arquivo.'))
  if (/[. ]$/.test(name)) checks.push(warn('Nome', 'Termina com ponto ou espaço, que o Windows remove.'))
  if (/\u202e/.test(name)) checks.push(bad('Nome', 'Tem o caractere de inversão de texto (RLO), usado para disfarçar a extensão real.'))
  return checks.length ? checks : [ok('Nome', `${name} sem truques na extensão.`)]
}

// ——— Integridade por formato ———

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const value of bytes) c = CRC_TABLE[(c ^ value) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function inspectPng(bytes: Uint8Array): Check[] {
  let at = 8
  let first = ''
  let dims = ''
  let sawData = false
  while (at + 8 <= bytes.length) {
    const length = u32be(bytes, at)
    const type = ascii(bytes, at + 4, at + 8)
    if (at + 12 + length > bytes.length) return [bad('Estrutura', `O bloco ${type} passa do fim do arquivo: imagem truncada.`)]
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== u32be(bytes, at + 8 + length)) return [bad('Estrutura', `CRC do bloco ${type} não confere: dados corrompidos.`)]
    if (!first) {
      first = type
      if (type !== 'IHDR') return [bad('Estrutura', 'O primeiro bloco não é IHDR.')]
      const depth = bytes[at + 16]
      const color = ['tons de cinza', '', 'RGB', 'paleta', 'cinza com alfa', '', 'RGBA'][bytes[at + 17]] ?? 'cor desconhecida'
      dims = `${u32be(bytes, at + 8)}×${u32be(bytes, at + 12)} px, ${color}, ${depth} bits`
    }
    if (type === 'IDAT') sawData = true
    at += 12 + length
    if (type === 'IEND') {
      const checks = [ok('Estrutura', `PNG ${dims}. Todos os blocos com CRC correto.`)]
      if (!sawData) checks.push(bad('Pixels', 'Nenhum bloco IDAT: a imagem não tem pixels.'))
      if (at < bytes.length) checks.push(warn('Sobra', `${size(bytes.length - at)} depois do fim da imagem (IEND). Pode esconder outro arquivo.`))
      return checks
    }
  }
  return [bad('Estrutura', 'Não chegou ao bloco IEND: imagem truncada.')]
}

function inspectJpeg(bytes: Uint8Array): Check[] {
  let at = 2
  let dims = ''
  let exif = false
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return [bad('Estrutura', `Marcador inválido na posição ${at}: dados corrompidos.`)]
    const marker = bytes[at + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      at += marker === 0xff ? 1 : 2
      continue
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    if (at + 2 + length > bytes.length) return [bad('Estrutura', 'Um segmento passa do fim do arquivo: imagem truncada.')]
    if (marker === 0xe1 && ascii(bytes, at + 4, at + 8) === 'Exif') exif = true
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      dims = `${(bytes[at + 7] << 8) | bytes[at + 8]}×${(bytes[at + 5] << 8) | bytes[at + 6]} px${marker === 0xc2 ? ', progressivo' : ''}`
    }
    if (marker === 0xda) break
    at += 2 + length
  }
  let end = bytes.length
  while (end > 2 && !(bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9)) end -= 1
  if (end <= 2) return [bad('Estrutura', 'Não termina com o marcador EOI (FFD9): imagem truncada.')]
  const checks = [ok('Estrutura', `JPEG ${dims || 'sem dimensões declaradas'}${exif ? ', com EXIF' : ''}.`)]
  if (!dims) checks.push(bad('Quadro', 'Sem segmento SOF: não há como saber o tamanho da imagem.'))
  if (end < bytes.length - 2) checks.push(warn('Sobra', `${size(bytes.length - end)} depois do fim da imagem. Pode esconder outro arquivo.`))
  return checks
}

function inspectGif(bytes: Uint8Array): Check[] {
  const width = u16le(bytes, 6)
  const height = u16le(bytes, 8)
  let at = 13 + (bytes[10] & 0x80 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0)
  let frames = 0
  const skipBlocks = () => {
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1
    at += 1
  }
  while (at < bytes.length) {
    const block = bytes[at]
    if (block === 0x3b) {
      const checks = [ok('Estrutura', `GIF ${width}×${height} px, ${frames} ${frames === 1 ? 'quadro' : 'quadros'}.`)]
      if (!frames) checks.push(bad('Quadros', 'Nenhum quadro de imagem.'))
      if (at + 1 < bytes.length) checks.push(warn('Sobra', `${size(bytes.length - at - 1)} depois do fim (trailer).`))
      return checks
    }
    if (block === 0x21) {
      at += 2
      skipBlocks()
    } else if (block === 0x2c) {
      frames += 1
      const packed = bytes[at + 9]
      at += 10 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0) + 1
      skipBlocks()
    } else return [bad('Estrutura', `Bloco desconhecido na posição ${at}: dados corrompidos.`)]
  }
  return [bad('Estrutura', 'Não chegou ao trailer (3B): GIF truncado.')]
}

function inspectRiff(bytes: Uint8Array, kind: string): Check[] {
  const declared = u32le(bytes, 4) + 8
  const checks: Check[] = []
  if (declared > bytes.length) return [bad('Estrutura', `O cabeçalho RIFF declara ${size(declared)}, mas o arquivo tem ${size(bytes.length)}: truncado.`)]
  if (declared < bytes.length) checks.push(warn('Sobra', `${size(bytes.length - declared)} além do que o cabeçalho RIFF declara.`))
  if (kind === 'wav') {
    let at = 12
    let format = ''
    let rate = 0
    let byteRate = 0
    while (at + 8 <= declared) {
      const id = ascii(bytes, at, at + 4)
      const length = u32le(bytes, at + 4)
      if (id === 'fmt ') {
        const channels = u16le(bytes, at + 10)
        rate = u32le(bytes, at + 12)
        byteRate = u32le(bytes, at + 16)
        format = `${u16le(bytes, at + 8) === 1 ? 'PCM' : `formato ${u16le(bytes, at + 8)}`}, ${channels} ${channels === 1 ? 'canal' : 'canais'}, ${rate} Hz, ${u16le(bytes, at + 22)} bits`
      }
      if (id === 'data') {
        if (!format) return [bad('Estrutura', 'Bloco de áudio antes do bloco fmt.')]
        if (at + 8 + length > bytes.length) return [bad('Estrutura', 'O bloco de áudio passa do fim do arquivo: truncado.')]
        const seconds = byteRate ? length / byteRate : 0
        return [ok('Estrutura', `WAV ${format}, ${seconds.toFixed(2).replace('.', ',')} s.`), ...checks]
      }
      at += 8 + length + (length % 2)
    }
    return [bad('Estrutura', format ? 'Sem bloco data: não há áudio.' : 'Sem bloco fmt.')]
  }
  if (kind === 'avi' && !ascii(bytes, 12, 4096).includes('hdrl')) return [bad('Estrutura', 'AVI sem cabeçalho hdrl.')]
  return [ok('Estrutura', `${kind === 'avi' ? 'AVI' : 'WebP'} com tamanho RIFF coerente.`), ...checks]
}

function inspectBmp(bytes: Uint8Array): Check[] {
  const declared = u32le(bytes, 2)
  const dims = `${u32le(bytes, 18)}×${Math.abs(u32le(bytes, 22) | 0)} px, ${u16le(bytes, 28)} bits`
  if (declared > bytes.length) return [bad('Estrutura', `Declara ${size(declared)}, mas tem ${size(bytes.length)}: truncado.`)]
  return [ok('Estrutura', `BMP ${dims}.`)]
}

function inspectMp4(bytes: Uint8Array): Check[] {
  let at = 0
  const boxes: string[] = []
  while (at + 8 <= bytes.length) {
    let length = u32be(bytes, at)
    const type = ascii(bytes, at + 4, at + 8)
    if (length === 1) length = Number(BigInt(u32be(bytes, at + 8)) << 32n | BigInt(u32be(bytes, at + 12)))
    if (length === 0) length = bytes.length - at
    if (length < 8) return [bad('Estrutura', `Caixa ${type} com tamanho inválido.`)]
    if (at + length > bytes.length) return [bad('Estrutura', `A caixa ${type} passa do fim do arquivo: truncado.`)]
    boxes.push(type)
    at += length
  }
  const brand = ascii(bytes, 8, 12).trim()
  const checks = [ok('Estrutura', `Contêiner MP4 (marca ${brand}) com caixas ${boxes.join(', ')}.`)]
  if (!boxes.includes('moov')) checks.push(bad('Índice', 'Sem caixa moov: os players não sabem reproduzir.'))
  if (!boxes.includes('mdat')) checks.push(warn('Mídia', 'Sem caixa mdat: não há dados de mídia.'))
  return checks
}

function inspectMp3(bytes: Uint8Array): Check[] {
  let at = 0
  if (ascii(bytes, 0, 3) === 'ID3') at = 10 + ((bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f))
  if (at >= bytes.length) return [bad('Estrutura', 'Só tem a etiqueta ID3, sem áudio.')]
  for (let index = at; index < Math.min(bytes.length - 1, at + 65536); index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
      return [ok('Estrutura', `Quadro de áudio MPEG encontrado${at ? ' depois da etiqueta ID3' : ''}.`)]
    }
  }
  return [bad('Estrutura', 'Nenhum quadro de áudio MPEG no começo do arquivo.')]
}

function inspectExe(bytes: Uint8Array): Check[] {
  const offset = u32le(bytes, 0x3c)
  if (offset + 24 > bytes.length || ascii(bytes, offset, offset + 4) !== 'PE\0\0') return [warn('Estrutura', 'Começa com MZ, mas sem cabeçalho PE: executável antigo (DOS) ou truncado.'), bad('Conteúdo ativo', 'Arquivo executável.')]
  const machine = u16le(bytes, offset + 4)
  const dll = (u16le(bytes, offset + 22) & 0x2000) !== 0
  const arch = machine === 0x8664 ? '64 bits' : machine === 0x14c ? '32 bits' : machine === 0xaa64 ? 'ARM64' : `máquina 0x${machine.toString(16)}`
  return [ok('Estrutura', `Executável PE ${arch}${dll ? ' (DLL)' : ''}.`), bad('Conteúdo ativo', 'É um programa: roda código ao ser aberto. Uploads normalmente bloqueiam.')]
}

function utf16Names(bytes: Uint8Array) {
  const names = new Set<string>()
  let current = ''
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8)
    if (code >= 0x20 && code < 0x7f) current += String.fromCharCode(code)
    else {
      if (current.length >= 3) names.add(current)
      current = ''
    }
  }
  return names
}

// Office 97-2003 marca a senha de abertura dentro do próprio stream, não no contêiner. Sem ler o diretório OLE,
// procura o começo do stream nos limites de setor: o FIB do Word (A5EC) e o BOF de globais do Excel (BIFF8).
function legacyPassword(bytes: Uint8Array, sector: number, word: boolean) {
  for (let at = 512; at + 32 <= bytes.length; at += word ? sector : 64) {
    if (word && u16le(bytes, at) === 0xa5ec) return (u16le(bytes, at + 0x0a) & 0x0100) !== 0
    if (!word && starts(bytes, [0x09, 0x08, 0x10, 0x00, 0x00, 0x06, 0x05, 0x00], at)) return u16le(bytes, at + 20) === 0x002f
  }
  return null
}

function inspectOle(bytes: Uint8Array): { kind: string; checks: Check[] } {
  const shift = u16le(bytes, 0x1e)
  const sector = 2 ** shift
  if (shift !== 9 && shift !== 12) return { kind: 'ole', checks: [bad('Estrutura', 'Cabeçalho OLE com tamanho de setor inválido.')] }
  const names = utf16Names(bytes)
  const has = (name: string) => names.has(name) || [...names].some((item) => item.endsWith(name))
  // DOCX/XLSX/PPTX com senha de abertura deixam de ser ZIP e viram um OLE com EncryptedPackage.
  const encrypted = has('EncryptedPackage')
  const kind = encrypted ? 'Office com senha (DOCX/XLSX/PPTX criptografado)' : has('WordDocument') ? 'Word 97-2003 (.doc)' : has('Workbook') || has('Book') ? 'Excel 97-2003 (.xls)' : has('PowerPoint Document') ? 'PowerPoint 97-2003 (.ppt)' : [...names].some((item) => item.startsWith('__substg1.0_')) ? 'mensagem do Outlook (.msg)' : 'contêiner OLE'
  const checks: Check[] = [ok('Estrutura', `Contêiner OLE (setores de ${sector} bytes): ${kind}.`)]
  if ((bytes.length - 512) % sector !== 0) checks.push(warn('Tamanho', 'O tamanho não fecha em setores inteiros: pode estar truncado.'))
  if (encrypted) checks.push(warn('Proteção', 'Tem senha para abrir: o documento está criptografado e o conteúdo não pôde ser inspecionado.'))
  else if (has('WordDocument') || has('Workbook') || has('Book')) {
    const locked = legacyPassword(bytes, sector, has('WordDocument'))
    checks.push(locked === null ? warn('Proteção', 'Não foi possível confirmar se tem senha para abrir.') : locked ? warn('Proteção', 'Tem senha para abrir (criptografia do Office 97-2003).') : ok('Proteção', 'Sem senha para abrir.'))
  } else if (has('PowerPoint Document')) checks.push(warn('Proteção', 'Senha em .ppt antigo não é verificada aqui.'))
  if (has('_VBA_PROJECT') || has('Macros') || (has('VBA') && has('dir'))) checks.push(bad('Macro', 'Contém projeto VBA: o documento tem macro.'))
  if (has('Ole10Native')) checks.push(warn('Objeto embutido', 'Tem objeto OLE embutido (Ole10Native), que pode carregar um executável.'))
  if (has('ObjectPool')) checks.push(warn('Objeto embutido', 'Tem objetos embutidos (ObjectPool).'))
  return { kind: encrypted ? 'encrypted' : 'ole', checks }
}

function inspectRtf(bytes: Uint8Array): Check[] {
  const text = latin1(bytes)
  const checks: Check[] = []
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === '{') depth += 1
    else if (text[index] === '}') depth -= 1
  }
  checks.push(depth === 0 ? ok('Estrutura', 'RTF com chaves balanceadas.') : bad('Estrutura', `${Math.abs(depth)} ${depth > 0 ? 'chaves abertas sem fechar: truncado' : 'chaves fechadas sobrando'}.`))
  if (/\\objdata|\\object\b/.test(text)) checks.push(warn('Objeto embutido', 'Tem objeto embutido (\\object), um vetor clássico de ataque em RTF.'))
  return checks
}

// /P guarda as permissões em bits (PDF 32000-1, tabela 22); bit desligado é ação bloqueada.
function pdfProtection(text: string): Check {
  if (!/\/Encrypt\b/.test(text)) return ok('Proteção', 'Sem senha e sem restrições.')
  const flags = /\/P\s+(-?\d+)/.exec(text)?.[1]
  const rights: [number, string][] = [[3, 'imprimir'], [4, 'editar'], [5, 'copiar texto'], [6, 'comentar']]
  const blocked = flags === undefined ? [] : rights.filter(([bit]) => (Number(flags) & (1 << (bit - 1))) === 0).map(([, name]) => name)
  return warn('Proteção', `Criptografado: pode ter senha para abrir${blocked.length ? ` e bloqueia ${blocked.join(', ')}` : ''}.`)
}

async function inspectPdf(bytes: Uint8Array): Promise<Check[]> {
  const text = latin1(bytes)
  const version = /%PDF-(\d\.\d)/.exec(text.slice(0, 1024))?.[1] ?? '?'
  const checks: Check[] = []
  const tail = text.slice(-2048)
  if (!tail.includes('%%EOF')) checks.push(bad('Fim do arquivo', 'Sem %%EOF no fim: o PDF está truncado ou incompleto.'))
  if (!text.includes('startxref')) checks.push(bad('Índice', 'Sem startxref: a tabela de objetos não é encontrada.'))
  let pages = 0
  const keys = new Set<string>()
  const scan = (value: string) => {
    for (const key of ['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA', '/SubmitForm', '/URI']) {
      if (new RegExp(`${key.replace('/', '\\/')}(?![A-Za-z])`).test(value)) keys.add(key)
    }
  }
  scan(text)
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    pages = doc.getPageCount()
    for (const [, object] of doc.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict) scan(object.toString())
      else if (object instanceof PDFStream) scan(object.dict.toString())
    }
    checks.unshift(ok('Estrutura', `PDF ${version} que abre, com ${pages} ${pages === 1 ? 'página' : 'páginas'}.`))
  } catch (error) {
    checks.unshift(bad('Estrutura', `O PDF não abre: a estrutura interna está ilegível (${error instanceof Error ? error.message.split('\n')[0] : 'erro de leitura'}).`))
  }
  checks.push(pdfProtection(text))
  if (keys.has('/JavaScript') || keys.has('/JS')) checks.push(bad('Conteúdo ativo', 'Tem JavaScript embutido.'))
  if (keys.has('/Launch')) checks.push(bad('Conteúdo ativo', 'Tem ação /Launch, que tenta abrir um programa.'))
  if (keys.has('/OpenAction') || keys.has('/AA')) checks.push(warn('Ação automática', 'Executa uma ação ao abrir (/OpenAction ou /AA).'))
  if (keys.has('/EmbeddedFile')) checks.push(warn('Anexo', 'Tem arquivo anexado dentro do PDF.'))
  if (keys.has('/RichMedia') || keys.has('/XFA')) checks.push(warn('Conteúdo ativo', 'Tem mídia interativa ou formulário XFA.'))
  if (keys.has('/SubmitForm')) checks.push(warn('Formulário', 'Tem formulário que envia dados para fora.'))
  if (!checks.some((check) => check.label === 'Conteúdo ativo' || check.label === 'Ação automática')) checks.push(ok('Conteúdo ativo', `Sem JavaScript, /Launch nem ação automática${keys.has('/URI') ? '; tem links' : ''}.`))
  return checks
}

const RISKY_INSIDE = /\.(exe|dll|scr|com|pif|bat|cmd|vbs|vbe|js|jse|wsf|ps1|hta|lnk|jar|msi|reg|cpl)$/i

async function inspectZip(bytes: Uint8Array, extension: string): Promise<{ kind: string; checks: Check[] }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/encrypt/i.test(message)) return { kind: 'zip', checks: [warn('Proteção', 'ZIP protegido por senha: o conteúdo não pôde ser inspecionado.')] }
    return { kind: 'zip', checks: [bad('Estrutura', `O ZIP não abre: ${message}.`)] }
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  const names = entries.map((entry) => entry.name)
  const has = (name: string) => names.some((item) => item.toLowerCase() === name.toLowerCase())
  let kind = 'zip'
  let mimetype = ''
  if (has('mimetype')) mimetype = (await zip.file('mimetype')?.async('string'))?.trim() ?? ''
  if (has('word/document.xml')) kind = 'docx'
  else if (has('xl/workbook.xml')) kind = 'xlsx'
  else if (has('ppt/presentation.xml')) kind = 'pptx'
  else if (mimetype.endsWith('opendocument.text')) kind = 'odt'
  else if (mimetype.endsWith('opendocument.spreadsheet')) kind = 'ods'
  else if (mimetype.endsWith('opendocument.presentation')) kind = 'odp'
  else if (has('AndroidManifest.xml')) kind = 'apk'
  else if (has('META-INF/MANIFEST.MF')) kind = 'jar'
  const checks: Check[] = []
  // O tamanho declarado no índice vem antes de descompactar, para uma zip bomb não estourar a memória.
  const declared = entries.reduce((total, entry) => total + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0)
  const ratio = declared / Math.max(1, bytes.length)
  const bomb = declared > 1024 ** 3 || (ratio > 100 && declared > 50 * 1024 ** 2)
  let corrupted = ''
  if (!bomb) {
    for (const entry of entries) {
      try {
        await entry.async('uint8array')
      } catch (error) {
        corrupted = `${entry.name}: ${error instanceof Error ? error.message : 'erro de leitura'}`
        break
      }
    }
  }
  if (bomb) checks.push(bad('Bomba de compressão', `Declara ${size(declared)} descompactado (${Math.round(ratio)}× o tamanho): padrão de zip bomb. O conteúdo não foi extraído.`))
  else checks.push(corrupted ? bad('Estrutura', `Entrada corrompida (${corrupted}).`) : ok('Estrutura', `${KIND_LABEL[kind]} com ${entries.length} ${entries.length === 1 ? 'entrada' : 'entradas'}, todas com CRC correto.`))
  if (!bomb && kind === 'zip') checks.push(ok('Compressão', `Descompacta para ${size(declared)}.`), ok('Proteção', 'Sem senha.'))
  // O JSZip limpa ../ do nome; o nome cru fica em unsafeOriginalName e é ele que escaparia da pasta ao extrair.
  const raw = entries.map((entry) => (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name)
  const slip = raw.filter((name) => /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-z]:/i.test(name))
  if (slip.length) checks.push(bad('Caminho', `Entrada que escapa da pasta ao extrair (zip slip): ${slip[0]}.`))
  const risky = names.filter((name) => RISKY_INSIDE.test(name))
  if (risky.length) checks.push(warn('Executável dentro', `Contém ${risky.length === 1 ? 'arquivo que executa' : `${risky.length} arquivos que executam`}: ${risky.slice(0, 3).join(', ')}.`))
  const nested = names.filter((name) => /\.(zip|rar|7z|gz)$/i.test(name))
  if (nested.length) checks.push(warn('Compactado dentro', `Tem outro compactado dentro (${nested[0]}), o que esconde o conteúdo de quem só olha a primeira camada.`))
  if (['docx', 'xlsx', 'pptx'].includes(kind)) checks.push(...await officeChecks(zip, names, kind, extension))
  if (['odt', 'ods', 'odp'].includes(kind)) {
    const scripts = names.filter((name) => /^(Basic|Scripts)\//.test(name) && !/script-lc\.xml$|dialog-lc\.xml$/.test(name))
    checks.push(scripts.length ? bad('Macro', `Tem macro (${scripts[0]}).`) : ok('Macro', 'Sem macros.'))
    const manifest = has('META-INF/manifest.xml') ? await zip.file('META-INF/manifest.xml')!.async('string') : ''
    const sealed = manifest.includes('encryption-data')
    checks.push(sealed ? warn('Proteção', 'Tem senha para abrir: o conteúdo está criptografado.') : ok('Proteção', 'Sem senha para abrir.'))
    if (has('content.xml') && !sealed) checks.push(...checkXml(await zip.file('content.xml')!.async('string')).map((check) => ({ ...check, label: 'XML do conteúdo' })))
  }
  return { kind, checks }
}

async function officeChecks(zip: JSZip, names: string[], kind: string, extension: string): Promise<Check[]> {
  const checks: Check[] = []
  const main = kind === 'docx' ? 'word/document.xml' : kind === 'xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml'
  if (!names.includes('[Content_Types].xml')) checks.push(bad('Pacote Office', 'Falta [Content_Types].xml: o Office não abre.'))
  const xml = await zip.file(main)?.async('string')
  if (xml !== undefined) {
    const syntax = checkXml(xml)
    checks.push(syntax[0].tone === 'ok' ? ok('XML principal', `${main} bem formado.`) : { ...syntax[0], label: 'XML principal' })
  }
  const macro = names.find((name) => /vbaProject\.bin$/i.test(name))
  const enabled = ['DOCM', 'XLSM', 'PPTM'].includes(extension)
  if (macro) checks.push(enabled ? warn('Macro', `Tem macro VBA (${macro}), como se espera de .${extension.toLowerCase()}.`) : bad('Macro', `Tem macro VBA (${macro}) num .${extension.toLowerCase() || 'zip'}: o formato não deveria ter macro.`))
  else checks.push(ok('Macro', 'Sem macros VBA.'))
  checks.push(await officeProtection(zip, names, kind, xml ?? ''))
  if (names.some((name) => /\/activeX\//i.test(name))) checks.push(warn('ActiveX', 'Tem controles ActiveX.'))
  const embedded = names.filter((name) => /\/embeddings\//i.test(name))
  if (embedded.length) checks.push(warn('Objeto embutido', `Tem ${embedded.length === 1 ? 'um objeto embutido' : `${embedded.length} objetos embutidos`} (${embedded[0].split('/').pop()}).`))
  for (const rels of names.filter((name) => name.endsWith('.rels'))) {
    const content = await zip.file(rels)?.async('string')
    if (!content || !/TargetMode="External"/.test(content)) continue
    const template = /Type="[^"]*(attachedTemplate|oleObject|frame)"[^>]*Target="([^"]+)"[^>]*TargetMode="External"/.exec(content) ?? /Target="([^"]+)"[^>]*TargetMode="External"[^>]*Type="[^"]*(attachedTemplate|oleObject|frame)"/.exec(content)
    if (template) checks.push(bad('Vínculo remoto', `Carrega conteúdo de fora ao abrir (${template[1].startsWith('http') ? template[1] : template[2]}): técnica de injeção de modelo remoto.`))
    else checks.push(warn('Links externos', 'Tem vínculos para endereços externos.'))
    break
  }
  return checks
}

// Chegando aqui o pacote abriu sem senha (com senha seria um OLE criptografado); o que pode haver é trava de edição.
async function officeProtection(zip: JSZip, names: string[], kind: string, main: string): Promise<Check> {
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? ''
  const locks: string[] = []
  if (kind === 'docx') {
    const settings = await read('word/settings.xml')
    const guard = /<w:documentProtection\b[^>]*>/.exec(settings)?.[0] ?? ''
    if (guard && /w:enforcement="(1|true|on)"/.test(guard)) {
      const modes: Record<string, string> = { readOnly: 'somente leitura', comments: 'só comentários', trackedChanges: 'só com controle de alterações', forms: 'só preencher formulários' }
      locks.push(modes[/w:edit="(\w+)"/.exec(guard)?.[1] ?? ''] ?? 'edição restrita')
    }
    if (/<w:writeProtection\b/.test(settings)) locks.push('senha para gravar alterações')
  }
  if (kind === 'xlsx') {
    if (/<workbookProtection\b/.test(main)) locks.push('estrutura da pasta travada')
    if (/<fileSharing\b[^>]*(password|hashValue)/i.test(main)) locks.push('senha para gravar alterações')
    const sheets = names.filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name))
    let locked = 0
    for (const sheet of sheets) if (/<sheetProtection\b/.test(await read(sheet))) locked += 1
    if (locked) locks.push(`${locked} de ${sheets.length} ${sheets.length === 1 ? 'planilha protegida' : 'planilhas protegidas'}`)
  }
  if (kind === 'pptx' && /<p:modifyVerifier\b/.test(main)) locks.push('senha para gravar alterações')
  return locks.length ? warn('Proteção', `Sem senha para abrir, mas com proteção: ${locks.join('; ')}.`) : ok('Proteção', 'Sem senha para abrir e sem trava de edição.')
}

function inspectText(bytes: Uint8Array, extension: string): Check[] {
  const checks: Check[] = []
  let text = ''
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    checks.push(ok('Codificação', `UTF-8${bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? ' com BOM' : ''}.`))
  } catch {
    text = latin1(bytes)
    checks.push(warn('Codificação', 'Não é UTF-8 válido; provavelmente Latin-1/Windows-1252. Acentos podem quebrar.'))
  }
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  if (crlf && lf) checks.push(warn('Quebras de linha', `Mistura CRLF (Windows) e LF (Unix): ${crlf} e ${lf}.`))
  const head = text.trimStart().slice(0, 200).toLowerCase()
  if (extension === 'JSON' || (!extension && /^[[{]/.test(head))) checks.push(...checkJson(text))
  else if (['XML', 'SVG'].includes(extension) || head.startsWith('<?xml')) checks.push(...checkXml(text))
  else if (extension === 'CSV') checks.push(...checkCsv(text))
  if (extension === 'SVG' || head.includes('<svg')) {
    if (/<script\b|\bon[a-z]+\s*=|javascript:/i.test(text)) checks.push(bad('Conteúdo ativo', 'SVG com script ou atributo on*=: executa JavaScript quando aberto no navegador.'))
    else checks.push(ok('Conteúdo ativo', 'SVG sem script.'))
  } else if (['HTML', 'HTM'].includes(extension) || head.startsWith('<!doctype html') || head.startsWith('<html')) {
    if (/<script\b|\bon[a-z]+\s*=/i.test(text)) checks.push(warn('Conteúdo ativo', 'HTML com script.'))
  }
  if (text.startsWith('#!')) checks.push(warn('Conteúdo ativo', `Script com interpretador (${text.split('\n', 1)[0]}).`))
  if (['BAT', 'CMD', 'VBS', 'JS', 'PS1', 'HTA', 'REG'].includes(extension)) checks.push(bad('Conteúdo ativo', `Script .${extension.toLowerCase()}: executa ao ser aberto no Windows.`))
  if (extension === 'EML' || /^(from|to|subject|mime-version|received):/im.test(text.slice(0, 2000))) {
    const attachments = [...text.matchAll(/filename\*?="?([^";\r\n]+)/gi)].map((match) => match[1])
    if (extension === 'EML' && !/^(from|subject):/im.test(text)) checks.push(bad('Cabeçalhos', 'E-mail sem cabeçalhos From/Subject.'))
    if (attachments.some((name) => RISKY_INSIDE.test(name))) checks.push(bad('Anexo', `Anexo executável: ${attachments.find((name) => RISKY_INSIDE.test(name))}.`))
    else if (attachments.length) checks.push(ok('Anexos', `${attachments.length} ${attachments.length === 1 ? 'anexo' : 'anexos'}: ${attachments.slice(0, 3).join(', ')}.`))
  }
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) checks.push(warn('Controle', 'Tem caracteres de controle invisíveis.'))
  return checks
}

export async function inspectFile(file: InFile): Promise<Verdict> {
  const { name, bytes } = file
  const extension = extensionOf(name)
  const checks: Check[] = [bytes.length ? ok('Tamanho', size(bytes.length)) : warn('Tamanho', 'Arquivo vazio (0 B).'), ...nameChecks(name)]
  if (!bytes.length) return report(name, checks)
  let kind = sniff(bytes)
  const structure: Check[] = []
  if (kind === 'pdf') structure.push(...await inspectPdf(bytes))
  else if (kind === 'png') structure.push(...inspectPng(bytes))
  else if (kind === 'jpeg') structure.push(...inspectJpeg(bytes))
  else if (kind === 'gif') structure.push(...inspectGif(bytes))
  else if (kind === 'bmp') structure.push(...inspectBmp(bytes))
  else if (kind === 'wav' || kind === 'avi' || kind === 'webp') structure.push(...inspectRiff(bytes, kind))
  else if (kind === 'mp4') structure.push(...inspectMp4(bytes))
  else if (kind === 'mp3') structure.push(...inspectMp3(bytes))
  else if (kind === 'zip') {
    const result = await inspectZip(bytes, extension)
    kind = result.kind
    structure.push(...result.checks)
  } else if (kind === 'ole') {
    const result = inspectOle(bytes)
    kind = result.kind
    structure.push(...result.checks)
  }
  else if (kind === 'exe') structure.push(...inspectExe(bytes))
  else if (kind === 'elf') structure.push(bad('Conteúdo ativo', 'Executável Linux (ELF).'))
  else if (kind === 'rtf') structure.push(...inspectRtf(bytes))
  else if (kind === 'text') structure.push(...inspectText(bytes, extension))
  else if (['rar', '7z', 'gzip'].includes(kind)) structure.push(warn('Estrutura', `${KIND_LABEL[kind]}: assinatura reconhecida; o conteúdo não é aberto aqui.`))
  else structure.push(warn('Estrutura', 'Conteúdo binário sem assinatura conhecida: não dá para conferir a estrutura.'))
  checks.push(ok('Tipo real', `Pelo conteúdo, é ${KIND_LABEL[kind] ?? kind}.`))
  const accepted = EXPECTED[extension]
  if (!extension) checks.push(warn('Extensão', `Sem extensão; o conteúdo é ${KIND_LABEL[kind]}.`))
  else if (!accepted) checks.push(warn('Extensão', `.${extension.toLowerCase()} não é uma extensão que este investigador conhece.`))
  else if (!accepted.includes(kind)) checks.push(bad('Extensão', `A extensão diz .${extension.toLowerCase()}, mas o conteúdo é ${KIND_LABEL[kind]}.`))
  else checks.push(ok('Extensão', `.${extension.toLowerCase()} confere com o conteúdo.`))
  checks.push(...structure)
  checks.push(ok('SHA-256', await sha256(bytes)))
  return report(name, checks)
}

export async function inspectFiles(files: InFile[]) {
  const verdicts: Verdict[] = []
  for (const file of files) verdicts.push(await inspectFile(file))
  return verdicts
}
