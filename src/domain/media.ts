import { GifWriter } from 'omggif'

export type MediaRequest = {
  sel?: string[]
  qtd?: number
  vazio?: boolean
  conteudo?: string
  audioDur?: number
  audioKind?: string
  audioChannels?: number
  audioRate?: number
  videoDur?: number
  videoRes?: string
  videoOrient?: string
  videoFps?: number
  videoAudio?: boolean
  imgFundo?: string
  imgGif?: string
  imgQuadros?: number
  imgFrameMs?: number
  imgProp?: string
  imgQual?: number
  imgExif?: string
}

const RATES = [8000, 22050, 44100, 48000]
const FPS = [8, 12, 15]

export function pixelSize(prop: string): [number, number] {
  if (prop === 'Vertical') return [360, 640]
  if (prop === 'Quadrada') return [512, 512]
  if (prop === 'Muito larga') return [960, 120]
  if (prop === 'Muito alta') return [120, 960]
  return [640, 360]
}

export function videoPixels(res: string, orient: string): [number, number] {
  const table: Record<string, [number, number]> = {
    '160×90': [160, 90],
    '320×180': [320, 180],
    '640×360': [640, 360],
  }
  const base = table[res] ?? [320, 180]
  return orient === 'Vertical' ? [base[1], base[0]] : base
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

function ascii(value: string) {
  return new TextEncoder().encode(value)
}

function le32(value: number) {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

function paintScene(width: number, height: number, frame: number, frames: number, transparent: boolean) {
  const pixels = new Uint8Array(width * height * 4)
  const ground = Math.floor(height * 0.72)
  const cube = Math.max(4, Math.round(Math.min(width, height) * 0.22))
  const travel = Math.max(0, width - cube - 4)
  const progress = frames <= 1 ? 0.5 : frame / (frames - 1)
  const x0 = Math.round(2 + travel * progress)
  const y0 = Math.max(0, ground - cube)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      let red = 0
      let green = 0
      let blue = 0
      let alpha = transparent ? 0 : 255
      if (!transparent) {
        if (y >= ground) {
          red = 110
          green = 168
          blue = 90
        } else {
          red = 142
          green = 197
          blue = 232
        }
      }
      if (x >= x0 && x < x0 + cube && y >= y0 && y < y0 + cube) {
        const top = y < y0 + cube * 0.28
        red = top ? 125 : 196
        green = top ? 154 : 165
        blue = top ? 78 : 116
        alpha = 255
        const eyeY = y0 + cube * 0.45
        const left = x0 + cube * 0.3
        const right = x0 + cube * 0.66
        if (Math.abs(y - eyeY) < Math.max(1, cube * 0.08) && (Math.abs(x - left) < Math.max(1, cube * 0.08) || Math.abs(x - right) < Math.max(1, cube * 0.08))) {
          red = 36
          green = 48
          blue = 36
        }
      }
      pixels[index] = red
      pixels[index + 1] = green
      pixels[index + 2] = blue
      pixels[index + 3] = alpha
    }
  }
  return pixels
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    table[index] = crc >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(ascii(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function adler32(data: Uint8Array) {
  let a = 1
  let b = 0
  for (let index = 0; index < data.length; index += 1) {
    a = (a + data[index]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function zlibStore(data: Uint8Array) {
  const parts: Uint8Array[] = [Uint8Array.of(0x78, 0x01)]
  let offset = 0
  do {
    const size = Math.min(65535, data.length - offset)
    const last = offset + size >= data.length
    const block = new Uint8Array(5 + size)
    block[0] = last ? 1 : 0
    block[1] = size & 255
    block[2] = size >> 8
    const complement = size ^ 0xffff
    block[3] = complement & 255
    block[4] = complement >> 8
    block.set(data.subarray(offset, offset + size), 5)
    parts.push(block)
    offset += size
  } while (offset < data.length)
  const tail = new Uint8Array(4)
  new DataView(tail.buffer).setUint32(0, adler32(data))
  parts.push(tail)
  return concat(parts)
}

export function encodePng(pixels: Uint8Array, width: number, height: number, transparent: boolean) {
  const channels = transparent ? 4 : 3
  const stride = width * channels
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4
      const target = row + 1 + x * channels
      raw[target] = pixels[source]
      raw[target + 1] = pixels[source + 1]
      raw[target + 2] = pixels[source + 2]
      if (channels === 4) raw[target + 3] = pixels[source + 3]
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  return concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlibStore(raw)),
    pngChunk('IEND', new Uint8Array()),
  ])
}

function gifPalette() {
  const palette = [0x000000]
  for (let red = 0; red < 6; red += 1) {
    for (let green = 0; green < 6; green += 1) {
      for (let blue = 0; blue < 6; blue += 1) {
        palette.push((Math.round(red * 51) << 16) | (Math.round(green * 51) << 8) | Math.round(blue * 51))
      }
    }
  }
  while (palette.length < 256) palette.push(0x000000)
  return palette
}

function gifIndex(red: number, green: number, blue: number, alpha: number) {
  if (alpha < 128) return 0
  const qr = Math.min(5, Math.round(red / 51))
  const qg = Math.min(5, Math.round(green / 51))
  const qb = Math.min(5, Math.round(blue / 51))
  return 1 + qr * 36 + qg * 6 + qb
}

export function encodeGif(width: number, height: number, frames: number, transparent: boolean, frameMs: number) {
  const count = Math.max(1, frames)
  const buffer = new Uint8Array(width * height * count + width * height + 65536)
  const writer = new GifWriter(buffer, width, height, {
    palette: gifPalette(),
    loop: count > 1 ? 0 : undefined,
  })
  const delay = Math.max(2, Math.round(frameMs / 10))
  for (let frame = 0; frame < count; frame += 1) {
    const pixels = paintScene(width, height, frame, count, transparent)
    const indexed = new Uint8Array(width * height)
    for (let index = 0; index < indexed.length; index += 1) {
      const offset = index * 4
      indexed[index] = gifIndex(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])
    }
    writer.addFrame(0, 0, width, height, indexed, {
      delay: count > 1 ? delay : 0,
      disposal: 2,
      transparent: transparent ? 0 : undefined,
    })
  }
  const end = writer.end()
  if (end > buffer.length) throw new Error('O GIF animado passou do espaço reservado. Reduza quadros ou proporção.')
  return buffer.slice(0, end)
}

function exifOrientation(label: string) {
  const match = label.match(/^[1368]/)
  return match ? Number(match[0]) : 0
}

export function injectExif(jpeg: Uint8Array, orientation: number) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('O JPEG gerado não tem o marcador de início.')
  const tiff = new Uint8Array(26)
  tiff.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00])
  tiff[10] = 0x12
  tiff[11] = 0x01
  tiff[12] = 3
  tiff[14] = 1
  tiff[18] = orientation
  const payload = concat([ascii('Exif\0\0'), tiff])
  const app1 = new Uint8Array(4 + payload.length)
  const view = new DataView(app1.buffer)
  app1[0] = 0xff
  app1[1] = 0xe1
  view.setUint16(2, payload.length + 2)
  app1.set(payload, 4)
  return concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)])
}

async function canvasJpeg(pixels: Uint8Array, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('O navegador não ofereceu canvas para gerar o JPEG.')
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality / 100))
  if (!blob) throw new Error('Não foi possível gerar o JPEG.')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function encodeJpeg(pixels: Uint8Array, width: number, height: number, quality: number, exifLabel: string) {
  const opaque = new Uint8Array(pixels)
  for (let index = 3; index < opaque.length; index += 4) opaque[index] = 255
  const bytes = typeof document === 'undefined'
    ? await nodeJpeg(opaque, width, height, quality)
    : await canvasJpeg(opaque, width, height, quality)
  const orientation = exifOrientation(exifLabel)
  return orientation ? injectExif(bytes, orientation) : bytes
}

async function nodeJpeg(pixels: Uint8Array, width: number, height: number, quality: number) {
  const jpeg = await import('jpeg-js')
  const encoded = jpeg.encode({ data: pixels, width, height }, quality)
  return new Uint8Array(encoded.data)
}

export function encodeWav(seconds: number, rate: number, channels: number, kind: string) {
  const samples = Math.round(rate * seconds)
  const dataSize = samples * channels * 2
  const out = new Uint8Array(44 + dataSize)
  const view = new DataView(out.buffer)
  out.set(ascii('RIFF'), 0)
  view.setUint32(4, 36 + dataSize, true)
  out.set(ascii('WAVE'), 8)
  out.set(ascii('fmt '), 12)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  out.set(ascii('data'), 36)
  view.setUint32(40, dataSize, true)
  const melody = [262, 294, 330, 349, 392, 440, 494, 523]
  for (let index = 0; index < samples; index += 1) {
    let sample = 0
    if (kind === 'Tom de teste') sample = Math.sin((2 * Math.PI * 440 * index) / rate)
    else if (kind === 'Áudio de exemplo') {
      const note = melody[Math.floor((index / rate) * 2) % melody.length]
      sample = Math.sin((2 * Math.PI * note * index) / rate) * 0.7
    }
    const pcm = Math.round(Math.max(-1, Math.min(1, sample)) * 12000)
    for (let channel = 0; channel < channels; channel += 1) {
      view.setInt16(44 + (index * channels + channel) * 2, pcm, true)
    }
  }
  return out
}

function chunk(id: string, data: Uint8Array) {
  const pad = data.length % 2 ? Uint8Array.of(0) : new Uint8Array()
  return concat([ascii(id), le32(data.length), data, pad])
}

function list(type: string, parts: Uint8Array[]) {
  return chunk('LIST', concat([ascii(type), ...parts]))
}

function frameBgr(pixels: Uint8Array, width: number, height: number) {
  const stride = Math.ceil((width * 3) / 4) * 4
  const data = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4
      const target = y * stride + x * 3
      data[target] = pixels[source + 2]
      data[target + 1] = pixels[source + 1]
      data[target + 2] = pixels[source]
    }
  }
  return data
}

function aviMain(fps: number, frames: number, streams: number, width: number, height: number, buffer: number) {
  const data = new Uint8Array(56)
  const view = new DataView(data.buffer)
  view.setUint32(0, Math.round(1_000_000 / fps), true)
  view.setUint32(4, buffer * fps, true)
  view.setUint32(12, 0x10, true)
  view.setUint32(16, frames, true)
  view.setUint32(24, streams, true)
  view.setUint32(28, buffer, true)
  view.setUint32(32, width, true)
  view.setUint32(36, height, true)
  return data
}

function aviStream(kind: 'vids' | 'auds', scale: number, rate: number, length: number, buffer: number, sample: number, width = 0, height = 0) {
  const data = new Uint8Array(56)
  const view = new DataView(data.buffer)
  data.set(ascii(kind), 0)
  if (kind === 'vids') data.set(ascii('DIB '), 4)
  view.setUint32(20, scale, true)
  view.setUint32(24, rate, true)
  view.setUint32(32, length, true)
  view.setUint32(36, buffer, true)
  view.setUint32(40, 0xffffffff, true)
  view.setUint32(44, sample, true)
  view.setInt16(52, width, true)
  view.setInt16(54, height, true)
  return data
}

function aviVideoFormat(width: number, height: number, imageSize: number) {
  const data = new Uint8Array(40)
  const view = new DataView(data.buffer)
  view.setUint32(0, 40, true)
  view.setInt32(4, width, true)
  view.setInt32(8, height, true)
  view.setUint16(12, 1, true)
  view.setUint16(14, 24, true)
  view.setUint32(20, imageSize, true)
  return data
}

function aviAudioFormat(rate: number) {
  const data = new Uint8Array(18)
  const view = new DataView(data.buffer)
  view.setUint16(0, 1, true)
  view.setUint16(2, 1, true)
  view.setUint32(4, rate, true)
  view.setUint32(8, rate * 2, true)
  view.setUint16(12, 2, true)
  view.setUint16(14, 16, true)
  return data
}

function indexEntry(id: string, offset: number, size: number) {
  const data = new Uint8Array(16)
  const view = new DataView(data.buffer)
  data.set(ascii(id), 0)
  view.setUint32(4, 0x10, true)
  view.setUint32(8, offset, true)
  view.setUint32(12, size, true)
  return data
}

export function encodeAvi(width: number, height: number, fps: number, seconds: number, withAudio: boolean) {
  const frames = Math.max(1, Math.round(fps * seconds))
  const bodies = Array.from({ length: frames }, (_, frame) => frameBgr(paintScene(width, height, frame, frames, false), width, height))
  const imageSize = bodies[0].length
  const streams = [list('strl', [chunk('strh', aviStream('vids', 1, fps, frames, imageSize, 0, width, height)), chunk('strf', aviVideoFormat(width, height, imageSize))])]
  let audio: Uint8Array | null = null
  if (withAudio) {
    const wav = encodeWav(seconds, 8000, 1, 'Tom de teste')
    audio = wav.subarray(44)
    streams.push(list('strl', [chunk('strh', aviStream('auds', 1, 8000, Math.round(8000 * seconds), audio.length, 2)), chunk('strf', aviAudioFormat(8000))]))
  }
  const moviParts: Uint8Array[] = []
  const entries: Uint8Array[] = []
  let offset = 4
  for (const body of bodies) {
    const part = chunk('00db', body)
    moviParts.push(part)
    entries.push(indexEntry('00db', offset, body.length))
    offset += part.length
  }
  if (audio) {
    const part = chunk('01wb', audio)
    moviParts.push(part)
    entries.push(indexEntry('01wb', offset, audio.length))
  }
  const hdrl = list('hdrl', [chunk('avih', aviMain(fps, frames, withAudio ? 2 : 1, width, height, imageSize)), ...streams])
  const body = concat([ascii('AVI '), hdrl, list('movi', moviParts), chunk('idx1', concat(entries))])
  return concat([ascii('RIFF'), le32(body.length), body])
}

export function estimateMediaBytes(extension: string, request: MediaRequest) {
  const ext = extension.toUpperCase()
  if (ext === 'WAV') {
    const rate = Number(request.audioRate ?? 44100)
    const channels = Number(request.audioChannels ?? 1)
    const seconds = Number(request.audioDur ?? 2)
    return 44 + Math.round(rate * seconds) * channels * 2
  }
  if (ext === 'AVI') {
    const [width, height] = videoPixels(String(request.videoRes ?? '320×180'), String(request.videoOrient ?? 'Horizontal'))
    const fps = Number(request.videoFps ?? 8)
    const seconds = Number(request.videoDur ?? 2)
    const frames = Math.max(1, Math.round(fps * seconds))
    const stride = Math.ceil((width * 3) / 4) * 4
    let bytes = 8192 + frames * (8 + stride * height)
    if (request.videoAudio) bytes += Math.round(8000 * seconds) * 2
    return bytes
  }
  if (ext === 'PNG' || ext === 'GIF' || ext === 'JPG' || ext === 'JPEG') {
    const [width, height] = pixelSize(String(request.imgProp ?? 'Horizontal'))
    if (ext === 'GIF') {
      const frames = request.imgGif === 'Animado' ? Number(request.imgQuadros ?? 4) : 1
      return width * height * frames + 8192
    }
    if (ext === 'PNG') return width * height * (request.imgFundo === 'Transparente' ? 4 : 3) + 1024
    return Math.ceil(width * height * 0.6) + 4096
  }
  return null
}

function integer(value: unknown, fallback?: number) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isInteger(number) ? number : Number.NaN
}

export function mediaRequestError(request: MediaRequest, limits: { file: number; total: number }) {
  if (request.vazio || request.conteudo !== 'Estrutura real') return null
  const selected = (request.sel ?? []).map((ext) => ext.toUpperCase())
  const images = selected.some((ext) => ['PNG', 'GIF', 'JPG', 'JPEG'].includes(ext))
  const jpg = selected.some((ext) => ext === 'JPG' || ext === 'JPEG')
  if (jpg && request.imgFundo === 'Transparente') {
    return 'JPG e JPEG não aceitam fundo transparente. Tire essas extensões ou escolha fundo opaco.'
  }
  if (selected.includes('GIF') && request.imgGif === 'Animado') {
    const frames = integer(request.imgQuadros, 4)
    const delay = integer(request.imgFrameMs, 200)
    if (frames < 2 || frames > 12) return 'O GIF animado precisa de 2 a 12 quadros.'
    if (delay < 20 || delay > 2000) return 'A duração de cada quadro precisa ser um inteiro de 20 a 2000 ms.'
  }
  if (images) {
    const quality = integer(request.imgQual, 80)
    if (jpg && (quality < 1 || quality > 100)) return 'A qualidade do JPEG precisa ser um inteiro de 1 a 100.'
  }
  if (selected.includes('WAV')) {
    const seconds = integer(request.audioDur, 2)
    const channels = integer(request.audioChannels, 1)
    const rate = integer(request.audioRate, 44100)
    if (seconds < 1 || seconds > 30) return 'A duração do áudio precisa ser um inteiro de 1 a 30 segundos.'
    if (channels !== 1 && channels !== 2) return 'O WAV aceita 1 ou 2 canais.'
    if (!RATES.includes(rate)) return 'A taxa do WAV precisa ser 8000, 22050, 44100 ou 48000 Hz.'
  }
  if (selected.includes('AVI')) {
    const seconds = integer(request.videoDur, 2)
    const fps = integer(request.videoFps, 8)
    if (seconds < 1 || seconds > 8) return 'A duração do vídeo precisa ser um inteiro de 1 a 8 segundos.'
    if (!FPS.includes(fps)) return 'O quadro por segundo do AVI precisa ser 8, 12 ou 15.'
  }
  let total = 0
  for (const ext of selected) {
    const estimate = estimateMediaBytes(ext, request)
    if (estimate === null) continue
    if (estimate > limits.file) {
      return `${ext} ficaria com cerca de ${estimate} bytes. O teto por arquivo é ${limits.file} bytes. Reduza duração, resolução ou quadros.`
    }
    total += estimate * Math.max(1, request.qtd ?? 1)
  }
  if (total > limits.total) {
    return `O lote de mídia ficaria com cerca de ${total} bytes. O teto do lote é ${limits.total} bytes.`
  }
  return null
}

export async function realMedia(extension: string, request: MediaRequest) {
  const ext = extension.toUpperCase()
  if (ext === 'WAV') {
    return encodeWav(
      Number(request.audioDur ?? 2),
      Number(request.audioRate ?? 44100),
      Number(request.audioChannels ?? 1),
      String(request.audioKind ?? 'Tom de teste'),
    )
  }
  if (ext === 'AVI') {
    const [width, height] = videoPixels(String(request.videoRes ?? '320×180'), String(request.videoOrient ?? 'Horizontal'))
    return encodeAvi(width, height, Number(request.videoFps ?? 8), Number(request.videoDur ?? 2), Boolean(request.videoAudio))
  }
  const [width, height] = pixelSize(String(request.imgProp ?? 'Horizontal'))
  const transparent = request.imgFundo === 'Transparente'
  if (ext === 'PNG') return encodePng(paintScene(width, height, 0, 1, transparent), width, height, transparent)
  if (ext === 'GIF') {
    const animated = request.imgGif === 'Animado'
    return encodeGif(width, height, animated ? Number(request.imgQuadros ?? 4) : 1, transparent, Number(request.imgFrameMs ?? 200))
  }
  if (ext === 'JPG' || ext === 'JPEG') {
    if (transparent) throw new Error('JPG não aceita fundo transparente.')
    return encodeJpeg(paintScene(width, height, 0, 1, false), width, height, Number(request.imgQual ?? 80), String(request.imgExif ?? 'Sem EXIF'))
  }
  return null
}
