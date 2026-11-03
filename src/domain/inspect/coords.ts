import { BRAZIL, WORLD, type GeoBox } from '../geo.ts'
import { bad, emptyInput, lines, ok, verdict, warn, type Check, type Outcome } from './verdict.ts'

export const GEO_REGIONS = ['Brasil', 'Mundo', 'Informada']

export type GeoOptions = { regiao: string; latMin: number; latMax: number; lngMin: number; lngMax: number }

type Point = { lat: number; lng: number; format: string; places: number }

const inside = (point: { lat: number; lng: number }, box: GeoBox) => point.lat >= box.latMin && point.lat <= box.latMax && point.lng >= box.lngMin && point.lng <= box.lngMax
const placesOf = (text: string) => Math.max(0, ...[...text.matchAll(/\d+[.,](\d+)/g)].map((match) => match[1].length))

function gms(part: string): { value: number; hemi: string } | { error: string } | null {
  const match = /^(-?\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([NSLOEW])?$/i.exec(part.trim())
  if (!match) return null
  const [deg, min, sec] = [Number(match[1]), Number(match[2]), Number(match[3].replace(',', '.'))]
  if (min >= 60 || sec >= 60) return { error: `Minutos e segundos vão de 0 a 59 (${part.trim()}).` }
  const sign = /[SOW]/i.test(match[4] ?? '') || deg < 0 ? -1 : 1
  return { value: sign * (Math.abs(deg) + min / 60 + sec / 3600), hemi: (match[4] ?? '').toUpperCase() }
}

function parsePoint(text: string): Point | string {
  const clean = text.trim()
  if (/°\s*\d+\s*['′]/.test(clean)) {
    const parts = clean.split(/\s*[,;]\s*|\s+(?=-?\d{1,3}\s*°)/)
    if (parts.length !== 2) return 'Em graus, minutos e segundos, separe latitude e longitude por vírgula.'
    const lat = gms(parts[0])
    const lng = gms(parts[1])
    if (!lat || !lng) return 'GMS fora do formato 23°32\'51.0" S.'
    if ('error' in lat) return lat.error
    if ('error' in lng) return lng.error
    if (lat.hemi && !'NS'.includes(lat.hemi)) return `A latitude precisa de N ou S, não ${lat.hemi}.`
    if (lng.hemi && !'LOEW'.includes(lng.hemi)) return `A longitude precisa de L/E ou O/W, não ${lng.hemi}.`
    return { lat: lat.value, lng: lng.value, format: 'graus, minutos e segundos', places: placesOf(clean) }
  }
  const hemi = /^(-?\d+(?:[.,]\d+)?)\s*°?\s*([NS])\s*[,;]?\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*([LOEW])$/i.exec(clean)
  if (hemi) {
    const lat = Number(hemi[1].replace(',', '.')) * (hemi[2].toUpperCase() === 'S' ? -1 : 1)
    const lng = Number(hemi[3].replace(',', '.')) * (/[OW]/i.test(hemi[4]) ? -1 : 1)
    if (hemi[1].startsWith('-') || hemi[3].startsWith('-')) return 'Use sinal ou letra do hemisfério, não os dois.'
    return { lat, lng, format: 'decimal com hemisfério', places: placesOf(clean) }
  }
  const decimal = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/.exec(clean)
  if (decimal) return { lat: Number(decimal[1]), lng: Number(decimal[2]), format: 'decimal', places: placesOf(clean) }
  if (/^-?\d+,\d+\s*[,;]\s*-?\d+,\d+$/.test(clean) || /^-?\d+,\d+\s+-?\d+,\d+$/.test(clean)) return 'Vírgula decimal: em coordenadas use ponto (-23.55, -46.63).'
  return 'Não é um par latitude, longitude reconhecível.'
}

function pointChecks(point: Point, box: GeoBox, region: string): Check[] {
  const checks: Check[] = [ok('Formato', `${point.format}.`)]
  const latOk = point.lat >= -90 && point.lat <= 90
  const lngOk = point.lng >= -180 && point.lng <= 180
  if (!latOk) checks.push(bad('Latitude', `${point.lat} está fora de -90 a 90.`))
  else checks.push(ok('Latitude', `${point.lat.toFixed(6)} (${point.lat < 0 ? 'Sul' : 'Norte'}).`))
  if (!lngOk) checks.push(bad('Longitude', `${point.lng} está fora de -180 a 180.`))
  else checks.push(ok('Longitude', `${point.lng.toFixed(6)} (${point.lng < 0 ? 'Oeste' : 'Leste'}).`))
  if (!latOk || !lngOk) return checks
  if (point.lat === 0 && point.lng === 0) checks.push(warn('Null Island', '0, 0 é o valor padrão de GPS sem sinal; raramente é um lugar de verdade.'))
  if (inside(point, box)) checks.push(ok('Região', `Dentro de ${region}.`))
  else if (inside({ lat: point.lng, lng: point.lat }, box)) checks.push(bad('Região', `Fora de ${region}, mas cai dentro se trocar latitude e longitude: provavelmente estão invertidas.`))
  else if (box !== WORLD) checks.push(bad('Região', `Fora de ${region}.`))
  if (point.places > 0 && point.places < 4) checks.push(warn('Precisão', `${point.places} casas decimais: erro de até ${point.places === 1 ? '11 km' : point.places === 2 ? '1,1 km' : '110 m'}.`))
  else if (point.places >= 4) checks.push(ok('Precisão', `${point.places} casas decimais (~${point.places >= 6 ? '0,1 m' : point.places === 5 ? '1 m' : '11 m'}).`))
  checks.push(ok('Mapa', `https://www.openstreetmap.org/?mlat=${point.lat.toFixed(6)}&mlon=${point.lng.toFixed(6)}#map=15/${point.lat.toFixed(6)}/${point.lng.toFixed(6)}`))
  return checks
}

function boxOf(options: GeoOptions): GeoBox {
  if (options.regiao === 'Mundo') return WORLD
  if (options.regiao === 'Informada') return { latMin: options.latMin, latMax: options.latMax, lngMin: options.lngMin, lngMax: options.lngMax }
  return BRAZIL
}

export function validateCoords(text: string, options: GeoOptions): Outcome {
  const items = lines(text)
  if (!items.length) return emptyInput('Cole ao menos uma coordenada, uma por linha.')
  const box = boxOf(options)
  const region = options.regiao === 'Informada' ? 'a área informada' : options.regiao === 'Mundo' ? 'o globo' : 'o Brasil'
  const labels = { ok: 'Coordenada válida', bad: 'Coordenada inválida', warn: 'Coordenada com ressalva' }
  return {
    verdicts: items.map((item) => {
      const area = item.split(/\s*(?:→|->|;\s*(?=-?\d))\s*/)
      if (area.length === 2) {
        const sw = parsePoint(area[0])
        const ne = parsePoint(area[1])
        if (typeof sw === 'string' || typeof ne === 'string') return verdict(item, [bad('Formato', typeof sw === 'string' ? `Sudoeste: ${sw}` : `Nordeste: ${ne}`)], labels)
        const checks: Check[] = [ok('Formato', 'Área (sudoeste → nordeste).')]
        const valid = [sw, ne].every((point) => point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180)
        if (!valid) checks.push(bad('Limites', 'Algum canto está fora do globo.'))
        else if (sw.lat > ne.lat || sw.lng > ne.lng) checks.push(bad('Limites', 'Sudoeste acima ou à direita do nordeste: limites invertidos.'))
        else if (sw.lat === ne.lat || sw.lng === ne.lng) checks.push(bad('Limites', 'Área com largura ou altura zero.'))
        else checks.push(ok('Limites', `${(ne.lat - sw.lat).toFixed(4)}° × ${(ne.lng - sw.lng).toFixed(4)}°.`))
        if (valid && box !== WORLD) checks.push(inside(sw, box) && inside(ne, box) ? ok('Região', `Dentro de ${region}.`) : bad('Região', `Sai de ${region}.`))
        return verdict(item, checks, { ok: 'Área válida', bad: 'Área inválida', warn: 'Área com ressalva' })
      }
      const point = parsePoint(item)
      return verdict(item, typeof point === 'string' ? [bad('Formato', point)] : pointChecks(point, box, region), labels)
    }),
  }
}
