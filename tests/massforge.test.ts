import { PDFDocument } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { generateCustom, validateCustom, customToJson } from '../src/domain/custom.ts'
import { buildDocument } from '../src/domain/documents.ts'
import { recordsToCsv, splitDiagnostics } from '../src/domain/export.ts'
import { generateFiles } from '../src/domain/files.ts'
import { ENG, rng, setReferenceDate } from '../src/domain/mfEngine.ts'

describe('geradores', () => {
  it('reproduz o CPF da especificação com a seed 4821', () => {
    setReferenceDate(new Date(2026, 9, 8))
    const item = ENG.cpf.one({ regra: 'DV correto', mask: 'Com máscara', uf: 'Qualquer', qtd: 1 }, rng(4821))
    expect(item.fields[0].v).toBe('107.321.469-92')
  })

  it('não mistura diagnóstico de unicidade nos registros exportados', () => {
    const items = ENG.numero.run({
      tipo: 'Inteiro', sinal: 'Qualquer', min: 1, max: 2, casas: '0', sep: 'Vírgula', milhar: false,
      regra: 'Aleatório no intervalo', ordem: 'Crescente', passo: 1, unicos: true, qtd: 5,
    }, rng(7))
    const split = splitDiagnostics(items)
    expect(split.records.length).toBeLessThanOrEqual(2)
    expect(split.diagnostics.some((item: { rule: string }) => item.rule === 'unicos')).toBe(true)
    expect(recordsToCsv(split.records)).not.toContain('limite de valores únicos')
  })
})

describe('boleto', () => {
  it('monta linha de 47 dígitos com DV Febraban', () => {
    setReferenceDate(new Date(2026, 9, 8))
    const item = ENG.boleto.one({
      banco: '001 · Banco do Brasil', vencimento: 'Futuro', regra: 'DV correto', mask: 'Só dígitos', qtd: 1,
    }, rng(4821))
    const linha = item.fields.find((field: { key: string }) => field.key === 'linha').v
    const bar = item.fields.find((field: { key: string }) => field.key === 'codigo_barras').v
    expect(linha).toMatch(/^\d{47}$/)
    expect(bar).toMatch(/^\d{44}$/)
    expect(bar.startsWith('0019')).toBe(true)
    const mod11 = (num: string) => {
      let sum = 0
      let weight = 2
      for (let i = num.length - 1; i >= 0; i--) {
        sum += Number(num[i]) * weight
        weight = weight === 9 ? 2 : weight + 1
      }
      const dv = 11 - (sum % 11)
      return dv === 0 || dv > 9 ? 1 : dv
    }
    expect(mod11(bar.slice(0, 4) + bar.slice(5))).toBe(Number(bar[4]))
    expect(item.fields.find((field: { key: string }) => field.key === 'payload').v).toContain('br.gov.bcb.pix')
  })
})

describe('massa personalizada', () => {
  it('bloqueia nome de coluna repetido', () => {
    const message = validateCustom([
      { id: '1', name: 'Nome', type: 'Nome', rule: 'Válido' },
      { id: '2', name: 'nome', type: 'E-mail', rule: 'Válido' },
    ], 2)
    expect(message).toMatch(/repetido/)
  })

  it('exporta os mesmos valores da prévia', () => {
    const columns = [{ id: '1', name: 'nome', type: 'Nome', rule: 'Válido' as const }]
    const records = generateCustom({
      columns,
      count: 3,
      seed: 99,
      referenceDate: new Date(2026, 9, 12),
      consistent: true,
    })
    const json = JSON.parse(customToJson(columns, records)) as { nome: string }[]
    expect(json.map((row) => row.nome)).toEqual(records.map((row) => row.values.nome))
  })
})

describe('arquivos e documentos', () => {
  it('gera arquivo vazio com zero bytes', async () => {
    const files = await generateFiles({
      sel: ['TXT'], nome: 'vazio', nomeVar: 'Simples', vazio: true, tam: 10, unid: 'KB',
      conteudo: 'Estrutura real', real: 'PNG', qtd: 1,
    }, 1)
    expect(files[0].sizeBytes).toBe(0)
  })

  it('gera xlsx real sem pedir título de documento', async () => {
    const files = await generateFiles({
      sel: ['XLSX'], nome: 'planilha', nomeVar: 'Simples', vazio: false, tam: 1, unid: 'KB',
      conteudo: 'Estrutura real', real: 'PNG', qtd: 1,
    }, 7)
    expect(files[0].bytes[0]).toBe(0x50)
    const zip = await JSZip.loadAsync(files[0].bytes)
    expect(zip.file('xl/worksheets/sheet1.xml')).toBeTruthy()
  })

  it('respeita o tamanho do conteúdo simulado', async () => {
    const files = await generateFiles({
      sel: ['BIN'], nome: 'ruido', nomeVar: 'Simples', vazio: false, tam: 128, unid: 'B',
      conteudo: 'Simulado', real: 'PNG', qtd: 1,
    }, 4)
    expect(files[0].sizeBytes).toBe(128)
  })

  it('alonga o parágrafo médio e o longo', async () => {
    const meta = { nome: 'relatorio', titulo: 'Relatorio', autor: 'QA', pagina: 'A4' as const, orient: 'Retrato' as const, conteudo: 'Normal' as const }
    const built = await buildDocument({
      format: 'Word',
      components: [
        { id: 'c', type: 'paragrafo', props: { qtd: 1, tam: 'Curto', negrito: false, italico: false } },
        { id: 'm', type: 'paragrafo', props: { qtd: 1, tam: 'Médio', negrito: false, italico: false } },
        { id: 'l', type: 'paragrafo', props: { qtd: 1, tam: 'Longo', negrito: false, italico: false } },
      ],
      meta,
      seed: 1,
    })
    const zip = await JSZip.loadAsync(built.bytes)
    const xml = await zip.file('word/document.xml')?.async('string')
    const texts = [...String(xml).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1])
    const lines = (text: string) => {
      const words = text.split(/\s+/)
      let count = 1
      let column = 0
      for (const word of words) {
        const next = column === 0 ? word.length : column + 1 + word.length
        if (column > 0 && next > 85) { count += 1; column = word.length } else column = next
      }
      return count
    }
    expect(lines(texts[0])).toBeGreaterThanOrEqual(3)
    expect(lines(texts[0])).toBeLessThan(8)
    expect(lines(texts[1])).toBeGreaterThanOrEqual(25)
    expect(lines(texts[2])).toBeGreaterThanOrEqual(30)
    expect(lines(texts[2])).toBeLessThan(36)
  })

  it('grava um docx que contém o título', async () => {
    const built = await buildDocument({
      format: 'Word',
      components: [{ id: '1', type: 'titulo', props: { texto: 'Relatorio de testes', nivel: 'H1' } }],
      meta: { nome: 'relatorio', titulo: 'Relatorio de testes', autor: 'QA', pagina: 'A4', orient: 'Retrato', conteudo: 'Normal' },
      seed: 1,
    })
    expect(built.bytes[0]).toBe(0x50)
    const zip = await JSZip.loadAsync(built.bytes)
    const xml = await zip.file('word/document.xml')?.async('string')
    expect(xml).toContain('Relatorio de testes')
    const header = await zip.file('word/header1.xml')?.async('string')
    expect(header).toContain('r:embed="rIdMark"')
    expect(header).toContain('behindDoc="1"')
    const mark = await zip.file('word/media/watermark.png')?.async('uint8array')
    expect(mark?.[0]).toBe(0x89)
    expect(mark?.[1]).toBe(0x50)
  })

  it('timbreia o rodapé do Word e a marca do PDF', async () => {
    const meta = { nome: 'relatorio', titulo: 'Relatorio', autor: 'QA', pagina: 'A4' as const, orient: 'Retrato' as const, conteudo: 'Normal' as const }
    const components = [
      { id: 'h', type: 'cabecalho', props: { texto: 'MassForge · documento de teste' } },
      { id: 'f', type: 'rodape', props: { texto: 'Dados ficticios para teste', num: true } },
    ]
    const word = await buildDocument({ format: 'Word', components, meta, seed: 1 })
    const zip = await JSZip.loadAsync(word.bytes)
    const header = await zip.file('word/header1.xml')?.async('string')
    const footer = await zip.file('word/footer1.xml')?.async('string')
    expect(header).toContain('documento de teste')
    expect(header).toContain('66504B')
    expect(footer).toContain('Dados ficticios para teste')
    expect(footer).toContain('PAGE')
    const pdf = await buildDocument({ format: 'PDF', components, meta, seed: 1 })
    const raw = Buffer.from(pdf.bytes)
    const source = raw.toString('latin1')
    const streams: string[] = []
    let cursor = 0
    while (cursor < source.length) {
      const start = source.indexOf('stream\n', cursor)
      if (start < 0) break
      const dataStart = start + 'stream\n'.length
      const end = source.indexOf('\nendstream', dataStart)
      if (end < 0) break
      const slice = raw.subarray(dataStart, end)
      try { streams.push(inflateSync(slice).toString('latin1')) } catch { streams.push(slice.toString('latin1')) }
      cursor = end + 10
    }
    const drawn = streams.join('\n')
    expect(drawn).toContain('4D617373466F726765')
    expect(drawn).toContain('646F63756D656E746F206465207465737465')
    expect(drawn).toContain('/Image-')
    expect(drawn).toContain(' Do')
  })

  it('grava uma planilha com a fórmula SOMA', async () => {
    const built = await buildDocument({
      format: 'Excel',
      components: [
        { id: 'aba', type: 'aba', props: { nome: 'Dados', linhas: 3, colunas: 2 } },
        { id: 'formula', type: 'formula', props: { func: 'SOMA', qtd: 3, erro: false } },
      ],
      meta: { nome: 'planilha', titulo: 'Planilha', autor: 'QA', pagina: 'A4', orient: 'Retrato', conteudo: 'Normal' },
      seed: 1,
    })
    const zip = await JSZip.loadAsync(built.bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(xml).toContain('SUM(')
  })

  it('recusa PROCV sem a aba Resumo', async () => {
    await expect(buildDocument({
      format: 'Excel',
      components: [{ id: 'formula', type: 'formula', props: { func: 'PROCV', qtd: 1, erro: false } }],
      meta: { nome: 'planilha', titulo: 'Planilha', autor: 'QA', pagina: 'A4', orient: 'Retrato', conteudo: 'Normal' },
      seed: 1,
    })).rejects.toThrow(/Resumo/)
  })

  it('abre o PDF gerado', async () => {
    const built = await buildDocument({
      format: 'PDF',
      components: [{ id: '1', type: 'titulo', props: { texto: 'Relatorio de testes', nivel: 'H1' } }],
      meta: { nome: 'relatorio', titulo: 'Relatorio de testes', autor: 'QA', pagina: 'A4', orient: 'Retrato', conteudo: 'Normal' },
      seed: 1,
    })
    const pdf = await PDFDocument.load(built.bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(0)
  })
})

describe('mídia e valores novos', () => {
  it('gera WAV PCM com tom e silêncio em zero', async () => {
    const { encodeWav } = await import('../src/domain/media.ts')
    const tone = encodeWav(1, 8000, 1, 'Tom de teste')
    const silence = encodeWav(1, 8000, 1, 'Silêncio')
    expect(String.fromCharCode(...tone.slice(0, 4))).toBe('RIFF')
    expect(tone.length).toBe(44 + 8000 * 2)
    expect(silence.subarray(44).every((byte) => byte === 0)).toBe(true)
    expect(tone.subarray(44).some((byte) => byte !== 0)).toBe(true)
  })

  it('gera PNG com transparência e GIF animado', async () => {
    const { encodeGif, encodePng } = await import('../src/domain/media.ts')
    const { GifReader } = await import('omggif')
    const pixels = new Uint8Array(8 * 8 * 4)
    pixels[3] = 0
    pixels[4] = 20
    pixels[5] = 40
    pixels[6] = 60
    pixels[7] = 255
    const png = encodePng(pixels, 8, 8, true)
    expect(png[0]).toBe(0x89)
    expect(png[25]).toBe(6)
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(view.getUint32(16)).toBe(8)
    expect(view.getUint32(20)).toBe(8)
    const gif = encodeGif(32, 24, 3, true, 200)
    const reader = new GifReader(gif)
    expect(reader.numFrames()).toBe(3)
    expect(reader.frameInfo(1).delay).toBe(20)
    const frame = new Uint8Array(32 * 24 * 4)
    reader.decodeAndBlitFrameRGBA(0, frame)
    expect(frame.some((value, index) => index % 4 === 3 && value === 0)).toBe(true)
  })

  it('grava EXIF sem mudar os pixels do JPEG', async () => {
    const { encodeJpeg } = await import('../src/domain/media.ts')
    const pixels = new Uint8Array(16 * 12 * 4).fill(255)
    const jpeg = await encodeJpeg(pixels, 16, 12, 80, '6 · 90° horário')
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
    const marker = jpeg.findIndex((byte, index) => byte === 0xff && jpeg[index + 1] === 0xe1 && jpeg[index + 4] === 0x45)
    expect(marker).toBeGreaterThan(0)
    expect(jpeg[marker + 20]).toBe(0x12)
    expect(jpeg[marker + 28]).toBe(6)
    let width = 0
    let height = 0
    for (let index = 2; index < jpeg.length - 8; index += 1) {
      if (jpeg[index] === 0xff && (jpeg[index + 1] === 0xc0 || jpeg[index + 1] === 0xc2)) {
        height = (jpeg[index + 5] << 8) | jpeg[index + 6]
        width = (jpeg[index + 7] << 8) | jpeg[index + 8]
        break
      }
    }
    expect(width).toBe(16)
    expect(height).toBe(12)
  })

  it('monta AVI reproduzível e recusa vídeo grande antes de gerar', async () => {
    const { encodeAvi } = await import('../src/domain/media.ts')
    const { validateFileRequest, generateFiles } = await import('../src/domain/files.ts')
    const avi = encodeAvi(16, 16, 8, 1, false)
    expect(String.fromCharCode(...avi.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...avi.slice(8, 12))).toBe('AVI ')
    const base = {
      nome: 'clipe', nomeVar: 'Simples', vazio: false, tam: 1, unid: 'KB', conteudo: 'Estrutura real', real: 'PNG', qtd: 1,
      videoDur: 8, videoRes: '640×360', videoOrient: 'Horizontal', videoFps: 15, videoAudio: false,
    }
    expect(validateFileRequest({ ...base, sel: ['AVI'], qtd: 30 })).toMatch(/lote de mídia/)
    const wav = await generateFiles({
      ...base, sel: ['WAV'], audioDur: 1, audioRate: 8000, audioChannels: 1, audioKind: 'Silêncio', videoDur: 1, videoFps: 8,
    }, 3)
    expect(wav[0].bytes[0]).toBe(0x52)
    expect(wav[0].description).toMatch(/bytes/)
  })

  it('não finge MP3 reproduzível e bloqueia JPG transparente', async () => {
    const { fileInfo } = await import('../src/domain/mfEngine.ts')
    const { validateFileRequest } = await import('../src/domain/files.ts')
    expect(fileInfo({ conteudo: 'Estrutura real', vazio: false }, 'MP3').tag).toBe('Simulado')
    expect(fileInfo({ conteudo: 'Estrutura real', vazio: false }, 'MP4').desc).toMatch(/AVI/)
    expect(validateFileRequest({
      sel: ['JPG'], nome: 'foto', nomeVar: 'Simples', vazio: false, tam: 1, unid: 'KB',
      conteudo: 'Estrutura real', real: 'PNG', qtd: 1, imgFundo: 'Transparente', imgQual: 80,
    })).toMatch(/transparente/)
  })

  it('lê EAN-13, Code 128 e QR com um leitor independente', async () => {
    const { decodeCode128, decodeEan13, eanCheck, encodeCode128, encodeEan13, qrRaster } = await import('../src/domain/symbols.ts')
    const jsQR = (await import('jsqr')).default
    const ean = encodeEan13('400638133393', false)
    expect(ean.text).toBe('4006381333931')
    expect(eanCheck('400638133393')).toBe(1)
    expect(decodeEan13(ean.bits)).toBe('4006381333931')
    const broken = encodeEan13('400638133393', true)
    expect(decodeEan13(broken.bits)?.slice(0, 12)).toBe('400638133393')
    expect(eanCheck(decodeEan13(broken.bits)!.slice(0, 12))).not.toBe(Number(decodeEan13(broken.bits)!.slice(12)))
    const code = encodeCode128('MassForge', false)
    expect(decodeCode128(code.bits)?.text).toBe('MassForge')
    expect(decodeCode128(code.bits)?.checksumOk).toBe(true)
    const bad = encodeCode128('MassForge', true)
    expect(decodeCode128(bad.bits)?.checksumOk).toBe(false)
    expect(encodeEan13('ABC', false).error).toMatch(/EAN-13/)
    const raster = qrRaster('https://exemplo.com/item/1', 4, 'M', 4)
    expect(jsQR(raster.data, raster.width, raster.height)?.data).toBe('https://exemplo.com/item/1')
  })

  it('mantém a mesma cor ao trocar HEX e RGB', async () => {
    const { colorValue, parseColor } = await import('../src/domain/values.ts')
    const { rng } = await import('../src/domain/mfEngine.ts')
    const hex = colorValue({ representation: 'HEX', origin: 'Aleatória', baseText: '', alpha: 100, rule: 'Válida', random: rng(9) })
    const rgb = colorValue({ representation: 'RGB', origin: 'Aleatória', baseText: '', alpha: 100, rule: 'Válida', random: rng(9) })
    if ('error' in hex || 'error' in rgb) throw new Error('cor')
    const left = parseColor(hex.value)
    const right = parseColor(rgb.value)
    expect(left).toEqual(right)
    const illegal = colorValue({ representation: 'HEX', origin: 'Aleatória', baseText: '', alpha: 100, rule: 'HEX inválido', random: rng(1) })
    if ('error' in illegal) throw new Error('regra')
    expect(parseColor(illegal.value)).toBeNull()
  })

  it('converte medida sem tratar zero como inválido', async () => {
    const { measureValue } = await import('../src/domain/values.ts')
    const zero = measureValue({
      kind: 'Comprimento', unit: 'cm', convertTo: 'mm', min: 0, max: 0, places: 0, comma: false, rule: 'Aleatório no intervalo', random: () => 0,
    })
    if ('error' in zero) throw new Error(zero.error)
    expect(zero.tone).toBe('ok')
    expect(zero.value).toBe('0 cm')
    expect(zero.converted).toBe('0 mm')
    const rounded = measureValue({
      kind: 'Comprimento', unit: 'mm', convertTo: 'm', min: 1, max: 1, places: 2, comma: false, rule: 'Aleatório no intervalo', random: () => 0,
    })
    if ('error' in rounded) throw new Error(rounded.error)
    expect(rounded.note).toMatch(/Arredondado/)
    const negative = measureValue({
      kind: 'Massa', unit: 'g', convertTo: 'Não converter', min: -5, max: -1, places: 0, comma: true, rule: 'Aleatório no intervalo', random: () => 0,
    })
    if ('error' in negative) throw new Error(negative.error)
    expect(negative.tone).toBe('ok')
    expect(negative.raw).toBeLessThan(0)
  })

  it('exporta lista, hierarquia e série no mesmo formato da prévia', async () => {
    const { buildStructured } = await import('../src/domain/structures.ts')
    const list = buildStructured({ formato: 'Lista', itens: 3, rotulo: 'Curto', regraLista: 'Repetidos' }, () => 0)
    expect(list?.info).toMatch(/duas vezes/)
    const tree = buildStructured({ formato: 'Hierarquia', niveis: 3, filhos: 1, saida: 'Plana', regraHier: 'Referência circular' }, () => 0)
    const parsed = JSON.parse(tree?.code || '{}') as { registros: { pai: string }[] }
    expect(parsed.registros[1].pai).toBe(parsed.registros[2].id)
    const zeros = buildStructured({ formato: 'Série', pontos: 3, seriesQtd: 1, casasSerie: 0, intervaloMin: 0, intervaloMax: 10, padrao: 'Zeros', catTipo: 'Categorias', saidaSerie: 'JSON', rotulo: 'Curto' }, () => 0)
    const missing = buildStructured({ formato: 'Série', pontos: 3, seriesQtd: 1, casasSerie: 0, intervaloMin: 0, intervaloMax: 10, padrao: 'Ausentes', catTipo: 'Categorias', saidaSerie: 'CSV', rotulo: 'Curto' }, () => 0)
    expect(JSON.parse(zeros?.code || '[]')[0].serie_1).toBe(0)
    expect(missing?.code.split('\n')[1]).toBe('Cat 1,')
  })

  it('repete o preset Produtos no CSV', async () => {
    const { generateCustom, productColumns, customToCsv } = await import('../src/domain/custom.ts')
    const columns = productColumns()
    const records = generateCustom({ columns, count: 4, seed: 11, referenceDate: new Date(2026, 0, 1), consistent: false })
    const skus = records.map((row) => row.values.sku)
    expect(new Set(skus).size).toBe(4)
    expect(customToCsv(columns, records)).toContain(skus[0])
    expect(records[0].values.peso).toMatch(/g/)
  })
})

describe('mapas e coordenadas', () => {
  it('gera ponto dentro do Brasil e recusa latitude inválida', async () => {
    const { ENG, rng } = await import('../src/domain/mfEngine.ts')
    const valid = ENG.mapa.run({ ...ENG.mapa.def, qtd: 5, regra: 'Válida' }, rng(3))
    expect(valid).toHaveLength(5)
    for (const row of valid) {
      const lat = Number(row.fields.find((field: { key: string }) => field.key === 'latitude').v)
      const lng = Number(row.fields.find((field: { key: string }) => field.key === 'longitude').v)
      expect(lat).toBeGreaterThanOrEqual(-33.75)
      expect(lat).toBeLessThanOrEqual(5.27)
      expect(lng).toBeGreaterThanOrEqual(-73.99)
      expect(lng).toBeLessThanOrEqual(-32.4)
      expect(row.fields.find((field: { key: string }) => field.key === 'mapa').v).toContain('openstreetmap.org')
    }
    const broken = ENG.mapa.run({ ...ENG.mapa.def, qtd: 1, regra: 'Latitude inválida' }, rng(4))
    expect(Number(broken[0].fields.find((field: { key: string }) => field.key === 'latitude').v)).toBeGreaterThan(90)
    expect(broken[0].fields.find((field: { key: string }) => field.key === 'mapa').v).toBe('sem ponto no mapa')
    const { mapEmbed } = await import('../src/domain/geo.ts')
    const link = valid[0].fields.find((field: { key: string }) => field.key === 'mapa').v as string
    expect(mapEmbed(link)).toContain('openstreetmap.org/export/embed.html')
    expect(mapEmbed(link)).toContain('marker=')
    expect(mapEmbed('sem ponto no mapa')).toBeNull()
  })

  it('não troca os cantos de uma área invertida', async () => {
    const { ENG, rng } = await import('../src/domain/mfEngine.ts')
    const rows = ENG.mapa.run({ ...ENG.mapa.def, tipo: 'Área', regra: 'Limites invertidos', qtd: 1 }, rng(8))
    const south = Number(rows[0].fields.find((field: { key: string }) => field.key === 'lat_sw').v)
    const north = Number(String(rows[0].fields.find((field: { key: string }) => field.key === 'nordeste').v).split(',')[0])
    expect(south).toBeGreaterThan(north)
    expect(rows[0].fields.find((field: { key: string }) => field.key === 'mapa').v).toBe('sem área no mapa')
  })

  it('bloqueia área informada com mínimo acima do máximo', async () => {
    const { ENG, rng } = await import('../src/domain/mfEngine.ts')
    const rows = ENG.mapa.run({ ...ENG.mapa.def, regiao: 'Informada', latMin: 10, latMax: 1, lngMin: -46, lngMax: -45, qtd: 3 }, rng(1))
    expect(rows).toHaveLength(1)
    expect(rows[0].rule).toBe('incompativel')
    expect(rows[0].fields.map((field: { v: string }) => field.v).join(' ')).toMatch(/mínimo está acima do máximo/)
  })

  it('disponibiliza Coordenada na massa personalizada', async () => {
    const { COLUMN_TYPES, generateCustom } = await import('../src/domain/custom.ts')
    expect(COLUMN_TYPES).toContain('Coordenada')
    const records = generateCustom({
      columns: [{ id: 'geo', name: 'ponto', type: 'Coordenada', rule: 'Válido' }],
      count: 2,
      seed: 5,
      referenceDate: new Date(2026, 0, 1),
      consistent: false,
    })
    expect(records[0].values.ponto).toMatch(/-?\d+\.\d{6}, -?\d+\.\d{6}/)
    expect(records[0].checks.ponto).toBe('passa')
  })
})

