import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library'
import jsQR from 'jsqr'

// Lê QR Code, o código de barras do boleto (ITF), EAN e Code 128 a partir dos pixels RGBA de uma foto.

export type Decoded = { text: string; format: string }

const FORMATS = [BarcodeFormat.QR_CODE, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128]
const LABEL: Partial<Record<BarcodeFormat, string>> = {
  [BarcodeFormat.QR_CODE]: 'QR Code',
  [BarcodeFormat.ITF]: 'Código de barras ITF',
  [BarcodeFormat.EAN_13]: 'EAN-13',
  [BarcodeFormat.EAN_8]: 'EAN-8',
  [BarcodeFormat.UPC_A]: 'UPC-A',
  [BarcodeFormat.CODE_128]: 'Code 128',
}

function luminance(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const out = new Uint8ClampedArray(width * height)
  for (let index = 0; index < out.length; index += 1) {
    const at = index * 4
    out[index] = (rgba[at] * 299 + rgba[at + 1] * 587 + rgba[at + 2] * 114) / 1000
  }
  return out
}

function rotate(gray: Uint8ClampedArray, width: number, height: number) {
  const out = new Uint8ClampedArray(gray.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) out[x * height + (height - 1 - y)] = gray[y * width + x]
  }
  return out
}

function zxing(gray: Uint8ClampedArray, width: number, height: number): Decoded | null {
  const reader = new MultiFormatReader()
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, FORMATS], [DecodeHintType.TRY_HARDER, true]])
  try {
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height))), hints)
    return { text: result.getText(), format: LABEL[result.getBarcodeFormat()] ?? 'Código' }
  } catch {
    return null
  }
}

export function decodePixels(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Decoded | null {
  const gray = luminance(rgba, width, height)
  const found = zxing(gray, width, height) ?? zxing(rotate(gray, width, height), height, width)
  if (found) return found
  const qr = jsQR(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), width, height)
  return qr ? { text: qr.data, format: 'QR Code' } : null
}
