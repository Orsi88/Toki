import { create } from 'qrcode'

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGLGLG', 'LGGLLG', 'LGLGGL', 'LGGGLG', 'LGGLGL']

const CODE128 = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
]

const START_B = 104
const STOP = 106

export function eanCheck(digits12: string) {
  let sum = 0
  for (let index = 0; index < 12; index += 1) sum += Number(digits12[index]) * (index % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

export function encodeEan13(digits: string, badCheck: boolean) {
  const clean = digits.replace(/\s/g, '')
  if (!/^\d{12,13}$/.test(clean)) {
    return { bits: '', text: digits, error: 'EAN-13 aceita 12 ou 13 dígitos. Letras e outros tamanhos não formam o símbolo.' }
  }
  const body = clean.slice(0, 12)
  let check = eanCheck(body)
  if (badCheck) check = (check + 1) % 10
  else if (clean.length === 13 && Number(clean[12]) !== check) {
    return { bits: '', text: clean, error: `O dígito ${clean[12]} não fecha o EAN-13. O verificador de ${body} é ${check}. Para testar isso de propósito, use a regra de dígito incorreto.` }
  }
  const full = `${body}${check}`
  const parity = EAN_PARITY[Number(full[0])]
  let bits = '101'
  for (let index = 1; index <= 6; index += 1) {
    const table = parity[index - 1] === 'L' ? EAN_L : EAN_G
    bits += table[Number(full[index])]
  }
  bits += '01010'
  for (let index = 7; index <= 12; index += 1) bits += EAN_R[Number(full[index])]
  bits += '101'
  return { bits, text: full, error: '' }
}

export function decodeEan13(bits: string) {
  if (bits.length !== 95 || !bits.startsWith('101') || !bits.endsWith('101') || bits.slice(45, 50) !== '01010') return null
  let parity = ''
  let leftDigits = ''
  const left = bits.slice(3, 45)
  for (let index = 0; index < 6; index += 1) {
    const chunk = left.slice(index * 7, index * 7 + 7)
    const l = EAN_L.indexOf(chunk)
    const g = EAN_G.indexOf(chunk)
    if (l >= 0) {
      parity += 'L'
      leftDigits += String(l)
    } else if (g >= 0) {
      parity += 'G'
      leftDigits += String(g)
    } else return null
  }
  const first = EAN_PARITY.indexOf(parity)
  if (first < 0) return null
  let rightDigits = ''
  const right = bits.slice(50, 92)
  for (let index = 0; index < 6; index += 1) {
    const digit = EAN_R.indexOf(right.slice(index * 7, index * 7 + 7))
    if (digit < 0) return null
    rightDigits += String(digit)
  }
  return `${first}${leftDigits}${rightDigits}`
}

export function encodeCode128(text: string, badChecksum: boolean) {
  if (!text) return { bits: '', error: 'Code 128 precisa de ao menos um caractere.' }
  const values: number[] = []
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code < 32 || code > 126) return { bits: '', error: `"${char}" não cabe no Code 128 conjunto B.` }
    values.push(code - 32)
  }
  let checksum = START_B
  values.forEach((value, index) => { checksum += value * (index + 1) })
  checksum %= 103
  if (badChecksum) checksum = (checksum + 1) % 103
  const bits = [START_B, ...values, checksum, STOP].map((code) => CODE128[code]).join('')
  return { bits, error: '' }
}

export function decodeCode128(bits: string) {
  if (!bits.startsWith(CODE128[START_B])) return null
  const codes: number[] = []
  let cursor = 0
  while (cursor < bits.length) {
    if (bits.slice(cursor, cursor + 13) === CODE128[STOP]) {
      codes.push(STOP)
      cursor += 13
      break
    }
    const value = CODE128.indexOf(bits.slice(cursor, cursor + 11))
    if (value < 0) return null
    codes.push(value)
    cursor += 11
  }
  if (codes[0] !== START_B || codes.at(-1) !== STOP || codes.length < 3) return null
  const data = codes.slice(1, -2)
  const check = codes[codes.length - 2]
  let sum = START_B
  data.forEach((value, index) => { sum += value * (index + 1) })
  return {
    text: data.map((value) => String.fromCharCode(value + 32)).join(''),
    checksumOk: check === sum % 103,
  }
}

function escapeXml(value: string) {
  return value.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'))
}

export function barsSvg(bits: string, label: string) {
  const module = 2
  const quiet = 11
  const barHeight = 74
  const height = 92
  const width = (bits.length + quiet * 2) * module
  let x = quiet * module
  let rects = ''
  for (const bit of bits) {
    if (bit === '1') rects += `<rect x="${x}" y="0" width="${module}" height="${barHeight}"/>`
    x += module
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#fff"/>${rects}<text x="${width / 2}" y="${height - 4}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="#111">${escapeXml(label)}</text></svg>`
}

export type QrEcc = 'L' | 'M' | 'Q' | 'H'

export function qrSvg(value: string, size: number, margin: number, ecc: QrEcc) {
  const qr = create(value, { errorCorrectionLevel: ecc })
  const count = qr.modules.size
  const cells: string[] = []
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (qr.modules.get(y, x)) cells.push(`<rect x="${x + margin}" y="${y + margin}" width="1" height="1"/>`)
    }
  }
  const dim = count + margin * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" role="img" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${cells.join('')}</g></svg>`
}

export function qrRaster(value: string, margin: number, ecc: QrEcc, scale = 4) {
  const qr = create(value, { errorCorrectionLevel: ecc })
  const count = qr.modules.size
  const dim = (count + margin * 2) * scale
  const data = new Uint8ClampedArray(dim * dim * 4)
  data.fill(255)
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!qr.modules.get(y, x)) continue
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const row = (y + margin) * scale + dy
          const col = (x + margin) * scale + dx
          const offset = (row * dim + col) * 4
          data[offset] = 0
          data[offset + 1] = 0
          data[offset + 2] = 0
          data[offset + 3] = 255
        }
      }
    }
  }
  return { data, width: dim, height: dim }
}

export function brokenQrSvg(size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="${size}" height="${size}" role="img"><rect width="21" height="21" fill="#fff"/><rect x="2" y="3" width="4" height="2"/><rect x="9" y="8" width="7" height="1"/><rect x="4" y="14" width="3" height="3"/><rect x="15" y="4" width="2" height="6"/></svg>`
}
