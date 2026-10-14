export type GeoBox = { latMin: number; latMax: number; lngMin: number; lngMax: number }

export const BRAZIL: GeoBox = { latMin: -33.75, latMax: 5.27, lngMin: -73.99, lngMax: -32.4 }
export const WORLD: GeoBox = { latMin: -90, latMax: 90, lngMin: -180, lngMax: 180 }

const POINT_RULES = ['Válida', 'Latitude inválida', 'Longitude inválida', 'Fora da região', 'Texto inválido']
const AREA_RULES = ['Válida', 'Limites invertidos', 'Área degenerada', 'Fora do mapa']

export type GeoResult = {
  error?: string
  tag: string
  tone: string
  rule: string
  why: string
  value: string
  latitude: string
  longitude: string
  extra: string
  link: string
}

type GeoInput = {
  tipo?: string
  formato?: string
  regiao?: string
  casas?: string | number
  regra?: string
  latMin?: number
  latMax?: number
  lngMin?: number
  lngMax?: number
  random: () => number
}

function placesOf(value: string | number | undefined) {
  const places = Number(value ?? 6)
  if (![0, 2, 4, 6].includes(places)) return null
  return places
}

function regionBox(input: GeoInput): { box: GeoBox } | { error: string } {
  if (input.regiao === 'Mundo') return { box: WORLD }
  if (input.regiao !== 'Informada') return { box: BRAZIL }
  const latMin = Number(input.latMin)
  const latMax = Number(input.latMax)
  const lngMin = Number(input.lngMin)
  const lngMax = Number(input.lngMax)
  if (![latMin, latMax, lngMin, lngMax].every(Number.isFinite)) {
    return { error: 'A área informada precisa de latitude e longitude numéricas.' }
  }
  if (latMin > latMax || lngMin > lngMax) {
    return { error: 'Na área informada, o mínimo está acima do máximo.' }
  }
  if (latMin < -90 || latMax > 90 || lngMin < -180 || lngMax > 180) {
    return { error: 'A área informada precisa caber em latitude -90 a 90 e longitude -180 a 180.' }
  }
  return { box: { latMin, latMax, lngMin, lngMax } }
}

function hemisphere(lat: number, lng: number) {
  const ns = lat < 0 ? 'S' : 'N'
  const ew = lng < 0 ? 'O' : 'L'
  return `${ns} / ${ew}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function gmsPart(value: number) {
  const abs = Math.abs(value)
  let deg = Math.floor(abs + 1e-9)
  const minuteFloat = (abs - deg) * 60
  let min = Math.floor(minuteFloat + 1e-8)
  let sec = Math.round((minuteFloat - min) * 60 * 10) / 10
  if (sec >= 60) {
    sec = 0
    min += 1
  }
  if (min >= 60) {
    min = 0
    deg += 1
  }
  return `${deg}°${pad(min)}'${sec.toFixed(1).padStart(4, '0')}"`
}

function formatPair(lat: number, lng: number, format: string, places: number) {
  if (format === 'Hemisfério') {
    const ns = lat < 0 ? 'S' : 'N'
    const ew = lng < 0 ? 'O' : 'L'
    return `${Math.abs(lat).toFixed(places)}° ${ns}, ${Math.abs(lng).toFixed(places)}° ${ew}`
  }
  if (format === 'GMS') return `${gmsPart(lat)} ${lat < 0 ? 'S' : 'N'}, ${gmsPart(lng)} ${lng < 0 ? 'O' : 'L'}`
  return `${lat.toFixed(places)}, ${lng.toFixed(places)}`
}

function fit(value: number, min: number, max: number, places: number) {
  let next = Number(value.toFixed(places))
  const step = 10 ** -places
  if (next < min) next = Number((min + step).toFixed(places))
  if (next > max) next = Number((max - step).toFixed(places))
  if (next < min || next > max) next = Number(((min + max) / 2).toFixed(places))
  return next
}

function sample(random: () => number, box: GeoBox, places: number) {
  const lat = fit(box.latMin + random() * (box.latMax - box.latMin), box.latMin, box.latMax, places)
  const lng = fit(box.lngMin + random() * (box.lngMax - box.lngMin), box.lngMin, box.lngMax, places)
  return { lat, lng }
}

function outside(random: () => number, box: GeoBox, places: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const point = sample(random, WORLD, places)
    const inside = point.lat >= box.latMin && point.lat <= box.latMax && point.lng >= box.lngMin && point.lng <= box.lngMax
    if (!inside) return point
  }
  return { lat: fit(48.86, -90, 90, places), lng: fit(2.35, -180, 180, places) }
}

export function mapEmbed(link: string) {
  let url: URL
  try { url = new URL(link) } catch { return null }
  if (url.hostname !== 'www.openstreetmap.org') return null
  const params = new URLSearchParams({ layer: 'mapnik' })
  const bbox = url.searchParams.get('bbox')
  if (bbox) {
    const [west, south, east, north] = bbox.split(',').map(Number)
    if (![west, south, east, north].every(Number.isFinite)) return null
    if (!(south <= north && west <= east)) return null
    const padLat = Math.max((north - south) * 0.2, 0.02)
    const padLng = Math.max((east - west) * 0.2, 0.02)
    params.set('bbox', [
      Math.max(-180, west - padLng),
      Math.max(-90, south - padLat),
      Math.min(180, east + padLng),
      Math.min(90, north + padLat),
    ].join(','))
  } else {
    const lat = Number(url.searchParams.get('mlat'))
    const lng = Number(url.searchParams.get('mlon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    const spanLat = 0.09
    const spanLng = 0.09 / Math.max(Math.cos((lat * Math.PI) / 180), 0.25)
    params.set('bbox', [
      Math.max(-180, lng - spanLng),
      Math.max(-90, lat - spanLat),
      Math.min(180, lng + spanLng),
      Math.min(90, lat + spanLat),
    ].join(','))
    params.set('marker', `${lat},${lng}`)
  }
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function pointLink(lat: number, lng: number) {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return 'sem ponto no mapa'
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`
}

function areaLink(south: number, west: number, north: number, east: number) {
  const ordered = south <= north && west <= east
  const inside = south >= -90 && north <= 90 && west >= -180 && east <= 180
  if (!ordered || !inside || south === north || west === east) return 'sem área no mapa'
  return `https://www.openstreetmap.org/?bbox=${west},${south},${east},${north}`
}

function pointResult(input: GeoInput, box: GeoBox, places: number, rule: string): GeoResult {
  const format = input.formato || 'Decimal'
  if (rule === 'Texto inválido') {
    return {
      tag: 'texto inválido',
      tone: 'bad',
      rule: 'texto_invalido',
      why: 'O par não é numérico. Não há ponto para abrir no mapa.',
      value: 'abc, xyz',
      latitude: '—',
      longitude: '—',
      extra: '—',
      link: 'sem ponto no mapa',
    }
  }
  if (rule === 'Fora da região' && input.regiao === 'Mundo') {
    return {
      error: 'Fora da região pede Brasil ou uma área informada.',
      tag: 'não se aplica',
      tone: 'warn',
      rule: 'nao_se_aplica',
      why: 'No mundo, todo ponto válido está dentro da região.',
      value: '—',
      latitude: '—',
      longitude: '—',
      extra: '—',
      link: 'sem ponto no mapa',
    }
  }
  let point = sample(input.random, box, places)
  if (rule === 'Latitude inválida') point = { lat: Number((90 + 1 + input.random() * 20).toFixed(places)), lng: point.lng }
  else if (rule === 'Longitude inválida') point = { lat: point.lat, lng: Number((180 + 1 + input.random() * 20).toFixed(places)) }
  else if (rule === 'Fora da região') point = outside(input.random, box, places)
  const broken = rule === 'Latitude inválida' || rule === 'Longitude inválida'
  const outsideRegion = rule === 'Fora da região'
  return {
    tag: rule === 'Válida' ? 'dentro da região' : rule === 'Fora da região' ? 'fora da região' : rule === 'Latitude inválida' ? 'latitude inválida' : 'longitude inválida',
    tone: rule === 'Válida' ? 'ok' : 'bad',
    rule: rule === 'Válida' ? 'dentro_da_regiao' : rule === 'Fora da região' ? 'fora_da_regiao' : rule === 'Latitude inválida' ? 'latitude_invalida' : 'longitude_invalida',
    why: broken
      ? `${rule === 'Latitude inválida' ? 'Latitude' : 'Longitude'} fora de ${rule === 'Latitude inválida' ? '-90 a 90' : '-180 a 180'}.`
      : outsideRegion
        ? 'Coordenada válida no globo, fora da região escolhida.'
        : `Ponto dentro ${input.regiao === 'Informada' ? 'da área informada' : input.regiao === 'Mundo' ? 'do mundo' : 'do Brasil'}.`,
    value: formatPair(point.lat, point.lng, format, places),
    latitude: point.lat.toFixed(places),
    longitude: point.lng.toFixed(places),
    extra: hemisphere(point.lat, point.lng),
    link: pointLink(point.lat, point.lng),
  }
}

function areaResult(input: GeoInput, box: GeoBox, places: number, rule: string): GeoResult {
  const format = input.formato || 'Decimal'
  const first = sample(input.random, box, places)
  const second = sample(input.random, box, places)
  let south = Math.min(first.lat, second.lat)
  let north = Math.max(first.lat, second.lat)
  let west = Math.min(first.lng, second.lng)
  let east = Math.max(first.lng, second.lng)
  if (north === south) north = fit(south + 10 ** -places, box.latMin, box.latMax, places)
  if (east === west) east = fit(west + 10 ** -places, box.lngMin, box.lngMax, places)
  if (rule === 'Área degenerada') {
    north = south
    east = west
  } else if (rule === 'Limites invertidos') {
    ;[south, north] = [north, south]
    ;[west, east] = [east, west]
  } else if (rule === 'Fora do mapa') {
    north = Number((90 + 5).toFixed(places))
  }
  const sw = formatPair(south, west, format, places)
  const ne = formatPair(north, east, format, places)
  const why = rule === 'Válida'
    ? 'Sudoeste fica abaixo e à esquerda do nordeste.'
    : rule === 'Limites invertidos'
      ? 'Os cantos estão trocados. A ordem não foi corrigida.'
      : rule === 'Área degenerada'
        ? 'Os dois cantos são o mesmo ponto.'
        : 'A latitude norte passa de 90. A área não cabe no mapa.'
  return {
    tag: rule === 'Válida' ? 'área válida' : rule === 'Limites invertidos' ? 'limites invertidos' : rule === 'Área degenerada' ? 'área degenerada' : 'fora do mapa',
    tone: rule === 'Válida' ? 'ok' : 'bad',
    rule: rule === 'Válida' ? 'area_valida' : rule === 'Limites invertidos' ? 'limites_invertidos' : rule === 'Área degenerada' ? 'area_degenerada' : 'fora_do_mapa',
    why,
    value: `${sw} → ${ne}`,
    latitude: south.toFixed(places),
    longitude: west.toFixed(places),
    extra: `${north.toFixed(places)}, ${east.toFixed(places)}`,
    link: areaLink(south, west, north, east),
  }
}

export function coordinateRows(input: GeoInput, count: number): GeoResult[] {
  const places = placesOf(input.casas)
  if (places === null) {
    return [{
      error: 'As casas decimais precisam ser 0, 2, 4 ou 6.',
      tag: 'configuração incompatível', tone: 'warn', rule: 'incompativel', why: '', value: '—', latitude: '—', longitude: '—', extra: '—', link: '—',
    }]
  }
  const region = regionBox(input)
  if ('error' in region) {
    return [{
      error: region.error,
      tag: 'configuração incompatível', tone: 'warn', rule: 'incompativel', why: region.error, value: '—', latitude: '—', longitude: '—', extra: '—', link: '—',
    }]
  }
  const area = input.tipo === 'Área'
  const rules = area ? AREA_RULES : POINT_RULES
  const selected = input.regra === 'Todas as variações' ? rules : [input.regra || 'Válida']
  const rows: GeoResult[] = []
  for (const rule of selected) {
    if (!area && rule === 'Fora da região' && input.regiao === 'Mundo' && input.regra !== 'Todas as variações') {
      return [{
        error: 'Fora da região pede Brasil ou uma área informada.',
        tag: 'configuração incompatível', tone: 'warn', rule: 'incompativel', why: '', value: '—', latitude: '—', longitude: '—', extra: '—', link: '—',
      }]
    }
    const amount = input.regra === 'Todas as variações' ? count : count
    const times = rule === 'Fora da região' && input.regiao === 'Mundo' ? 1 : amount
    for (let index = 0; index < times; index += 1) {
      rows.push(area ? areaResult(input, region.box, places, rule) : pointResult(input, region.box, places, rule))
      if (rows.length >= 1000) return rows
    }
  }
  return rows
}

export function coordinateCell(random: () => number, bad: boolean) {
  if (bad) return '95.000000, 0.000000'
  const row = pointResult({ tipo: 'Ponto', formato: 'Decimal', regiao: 'Brasil', casas: 6, regra: 'Válida', random }, BRAZIL, 6, 'Válida')
  return row.value
}
