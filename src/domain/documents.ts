import JSZip from 'jszip'
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { LIST_ITEMS, PARA, rng } from './mfEngine.ts'

export type DocFormat = 'Word' | 'Excel' | 'PowerPoint' | 'PDF'
export type DocComponent = { id: string; type: string; props: Record<string, unknown> }
export type DocMeta = {
  nome: string
  titulo: string
  autor: string
  pagina: 'A4' | 'Carta'
  orient: 'Retrato' | 'Paisagem'
  conteudo: 'Normal' | 'Extenso'
}

const LIMITS = { paragraphs: 400, rows: 2000, cells: 20000 }
const WATERMARK_FILE = 'marca-dagua-bloco-1254x1254-verde-claro-transparente.png'

let watermarkBytes: Promise<Uint8Array> | undefined

function loadWatermark() {
  watermarkBytes ??= readWatermark()
  return watermarkBytes
}

async function readWatermark() {
  if (import.meta.env.VITEST) {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    return new Uint8Array(await readFile(join(process.cwd(), 'public', 'imagens', WATERMARK_FILE)))
  }
  const response = await fetch(`/imagens/${WATERMARK_FILE}`)
  if (!response.ok) throw new Error('Não foi possível carregar a marca d’água.')
  return new Uint8Array(await response.arrayBuffer())
}

function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function countOf(value: unknown, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function factorOf(meta: DocMeta) {
  return meta.conteudo === 'Extenso' ? 10 : 1
}

function paragraphText(index: number, size: unknown) {
  const base = PARA[index % PARA.length]
  if (size === 'Curto') return base.split('.')[0] + '.'
  if (size === 'Longo') return `${base} ${PARA[(index + 1) % PARA.length]} ${PARA[(index + 2) % PARA.length]}`
  return base
}

function safeFile(name: string, extension: string) {
  const stem = (name || 'documento').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180)
  return `${stem || 'documento'}.${extension}`
}

function pageSize(meta: DocMeta) {
  const portrait = meta.pagina === 'Carta' ? { w: 12240, h: 15840 } : { w: 11906, h: 16838 }
  if (meta.orient === 'Paisagem') return { w: portrait.h, h: portrait.w, orient: 'landscape' }
  return { ...portrait, orient: 'portrait' }
}

function series(seed: number, points: number) {
  const random = rng(seed)
  return Array.from({ length: points }, (_, index) => ({
    label: `P${index + 1}`,
    value: Math.round(random() * 1000) / 10,
  }))
}

function assertBudget(paragraphs: number, rows: number, cols: number) {
  if (paragraphs > LIMITS.paragraphs) {
    throw new Error(`O volume passa de ${LIMITS.paragraphs} parágrafos. Reduza a quantidade ou desligue Extenso.`)
  }
  if (rows > LIMITS.rows || rows * Math.max(cols, 1) > LIMITS.cells) {
    throw new Error('A tabela passa do orçamento de células. Reduza linhas, colunas ou o volume Extenso.')
  }
}

type Built = { bytes: Uint8Array; filename: string; mime: string; notes: string[] }

export async function buildDocument(options: {
  format: DocFormat
  components: DocComponent[]
  meta: DocMeta
  seed: number
  imagePng?: Uint8Array
}): Promise<Built> {
  const notes: string[] = []
  if (options.meta.conteudo === 'Extenso') {
    notes.push('Volume Extenso: parágrafos e linhas de tabela foram multiplicados por 10.')
  }
  const incompatible = options.components.filter((component) => !compatible(options.format, component.type))
  if (incompatible.length) {
    throw new Error(`Há componentes incompatíveis com ${options.format}: ${incompatible.map((item) => item.type).join(', ')}.`)
  }
  if (options.format === 'Excel') {
    const needsSummary = options.components.some((component) => component.type === 'formula' && component.props.func === 'PROCV')
    const hasSummary = options.components.some((component) => component.type === 'aba' && String(component.props.nome || '').trim().toLocaleLowerCase('pt-BR') === 'resumo')
    if (needsSummary && !hasSummary) {
      throw new Error('PROCV precisa de uma aba chamada Resumo. Inclua a aba ou troque a função.')
    }
  }
  if (options.format === 'Word') return buildDocx(options, notes)
  if (options.format === 'Excel') return buildXlsx(options, notes)
  if (options.format === 'PowerPoint') return buildPptx(options, notes)
  return buildPdf(options, notes)
}

function compatible(format: DocFormat, type: string) {
  const map: Record<string, DocFormat[]> = {
    cabecalho: ['Word', 'PDF'],
    titulo: ['Word', 'PDF', 'PowerPoint'],
    subtitulo: ['Word', 'PDF', 'PowerPoint'],
    paragrafo: ['Word', 'PDF', 'PowerPoint'],
    lista: ['Word', 'PDF', 'PowerPoint'],
    tabela: ['Word', 'Excel', 'PowerPoint', 'PDF'],
    imagem: ['Word', 'Excel', 'PowerPoint', 'PDF'],
    grafico: ['Word', 'Excel', 'PowerPoint', 'PDF'],
    link: ['Word', 'PDF', 'PowerPoint'],
    comentario: ['Word', 'Excel'],
    formula: ['Excel'],
    quebra: ['Word', 'PDF'],
    aba: ['Excel'],
    slide: ['PowerPoint'],
    rodape: ['Word', 'PDF', 'PowerPoint'],
  }
  return (map[type] ?? []).includes(format)
}

function wParagraph(text: string, options?: { bold?: boolean; italic?: boolean; style?: string; size?: number }) {
  const props = [
    options?.style ? `<w:pStyle w:val="${xml(options.style)}"/>` : '',
  ].join('')
  const run = [
    options?.bold ? '<w:b/>' : '',
    options?.italic ? '<w:i/>' : '',
    options?.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
  ].join('')
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}<w:r>${run ? `<w:rPr>${run}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
}

async function buildDocx(options: { components: DocComponent[]; meta: DocMeta; seed: number; imagePng?: Uint8Array }, notes: string[]): Promise<Built> {
  const factor = factorOf(options.meta)
  const header = options.components.find((component) => component.type === 'cabecalho')
  const footer = options.components.find((component) => component.type === 'rodape')
  const extraHeaders = options.components.filter((component) => component.type === 'cabecalho').length
  if (extraHeaders > 1) notes.push('Word usa um cabeçalho por seção. Os cabeçalhos seguintes entraram no corpo.')
  const body: string[] = []
  const rels: string[] = []
  let relId = 1
  const nextRel = (type: string, target: string) => {
    const id = `rId${relId}`
    relId += 1
    rels.push(`<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    return id
  }
  let imageId = ''
  if (options.components.some((component) => component.type === 'imagem')) {
    if (!options.imagePng) throw new Error('A imagem de exemplo não foi carregada.')
    imageId = nextRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/image.png')
  }
  const headerId = nextRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', 'header1.xml')
  const footerId = footer ? nextRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer', 'footer1.xml') : ''
  const comments = options.components.filter((component) => component.type === 'comentario')
  let commentId = ''
  if (comments.length) commentId = nextRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', 'comments.xml')
  const hyperlinks: { id: string; url: string }[] = []
  let paragraphTotal = 0
  let commentIndex = 0
  let sawHeader = false
  for (const component of options.components) {
    const props = component.props
    if (component.type === 'cabecalho') {
      if (sawHeader) body.push(wParagraph(String(props.texto || '')))
      sawHeader = true
      continue
    }
    if (component.type === 'rodape') continue
    if (component.type === 'titulo') {
      const level = props.nivel === 'H3' ? 'Heading3' : props.nivel === 'H2' ? 'Heading2' : 'Heading1'
      body.push(wParagraph(String(props.texto || options.meta.titulo), { style: level }))
    } else if (component.type === 'subtitulo') {
      body.push(wParagraph(String(props.texto || ''), { style: 'Heading2' }))
    } else if (component.type === 'paragrafo') {
      const amount = Math.max(1, countOf(props.qtd, 1)) * factor
      paragraphTotal += amount
      assertBudget(paragraphTotal, 0, 0)
      for (let index = 0; index < amount; index += 1) {
        body.push(wParagraph(paragraphText(index, props.tam), { bold: Boolean(props.negrito), italic: Boolean(props.italico) }))
      }
    } else if (component.type === 'lista') {
      const amount = Math.max(1, countOf(props.itens, 4))
      for (let index = 0; index < amount; index += 1) {
        const marker = props.tipo === 'Numerada' ? `${index + 1}. ` : '• '
        body.push(wParagraph(marker + LIST_ITEMS[index % LIST_ITEMS.length]))
      }
    } else if (component.type === 'tabela') {
      const rows = Math.max(1, countOf(props.linhas, 5)) * factor
      const cols = Math.max(1, countOf(props.colunas, 3))
      assertBudget(paragraphTotal, rows, cols)
      body.push(wordTable(rows, cols, props.cab !== false))
    } else if (component.type === 'imagem') {
      const [width, height] = String(props.dim || '1280×720').split('×').map((part) => Number(part) || 1280)
      const cx = 5486400
      const cy = Math.round(cx * (height / width))
      body.push(wordImage(imageId, cx, cy))
      if (props.legenda !== false) body.push(wParagraph('Figura. Imagem fictícia para teste de incorporação.', { italic: true }))
    } else if (component.type === 'grafico') {
      notes.push('No Word, o gráfico entra como tabela de dados com os valores da série.')
      const points = series(options.seed, Math.max(1, Math.min(countOf(props.pontos, 6), 50)))
      body.push(wParagraph(`Gráfico de ${String(props.tipo || 'Barras')}`, { style: 'Heading2' }))
      body.push(chartTable(points))
    } else if (component.type === 'link') {
      const id = nextRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', xml(props.url || 'https://exemplo.com.br'))
      hyperlinks.push({ id, url: String(props.url || '') })
      rels[rels.length - 1] = `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(props.url || 'https://exemplo.com.br')}" TargetMode="External"/>`
      body.push(`<w:p><w:hyperlink r:id="${id}"><w:r><w:rPr><w:color w:val="34532F"/><w:u w:val="single"/></w:rPr><w:t>${xml(props.texto || props.url)}</w:t></w:r></w:hyperlink></w:p>`)
    } else if (component.type === 'comentario') {
      body.push(`<w:p><w:commentRangeStart w:id="${commentIndex}"/><w:r><w:t>${xml(props.texto || '')}</w:t></w:r><w:commentRangeEnd w:id="${commentIndex}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentIndex}"/></w:r></w:p>`)
      commentIndex += 1
    } else if (component.type === 'quebra') {
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    }
  }
  if (!body.length) {
    notes.push('Nenhum componente no corpo. Foi criado um documento mínimo válido.')
    body.push(wParagraph(options.meta.titulo || 'Documento de teste'))
  }
  const size = pageSize(options.meta)
  const sect = `<w:sectPr>${headerId ? `<w:headerReference w:type="default" r:id="${headerId}"/>` : ''}${footerId ? `<w:footerReference w:type="default" r:id="${footerId}"/>` : ''}<w:pgSz w:w="${size.w}" w:h="${size.h}" w:orient="${size.orient}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/></w:sectPr>`
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${body.join('')}${sect}</w:body></w:document>`
  const zip = new JSZip()
  const overrides = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
  ]
  overrides.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>')
  if (footerId) overrides.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>')
  if (comments.length) overrides.push('<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>')
  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
  ]
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.join('')}${overrides.join('')}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
  zip.file('word/document.xml', document)
  zip.file('word/styles.xml', wordStyles())
  zip.file('docProps/core.xml', coreProps(options.meta))
  const contentWidth = size.w - 2268
  const watermark = await loadWatermark()
  zip.file('word/media/watermark.png', watermark)
  zip.file('word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMark" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/watermark.png"/></Relationships>`)
  zip.file('word/header1.xml', headerXml(`${wordWatermark()}${letterheadLine(String(header?.props.texto || ''), contentWidth)}`))
  if (footer) {
    zip.file('word/footer1.xml', footerXml(letterheadFooter(String(footer.props.texto || ''), footer.props.num !== false, contentWidth)))
  }
  if (comments.length) {
    const author = String(comments[0].props.autor || options.meta.autor || 'QA')
    const blocks = comments.map((component, index) => `<w:comment w:id="${index}" w:author="${xml(component.props.autor || author)}" w:date="${new Date().toISOString()}" w:initials="QA"><w:p><w:r><w:t>${xml(component.props.texto || '')}</w:t></w:r></w:p></w:comment>`).join('')
    zip.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${blocks}</w:comments>`)
  }
  if (imageId && options.imagePng) zip.file('word/media/image.png', options.imagePng)
  void commentId
  void hyperlinks
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    bytes,
    filename: safeFile(options.meta.nome, 'docx'),
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    notes,
  }
}

function headerXml(inner: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${inner}</w:hdr>`
}

function footerXml(inner: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:ftr>`
}

function letterheadAside(text: string) {
  const raw = text.trim()
  const parts = raw.split(/\s*·\s*/)
  const branded = parts.length > 1 && parts[0].localeCompare('MassForge', 'pt-BR', { sensitivity: 'accent' }) === 0
  const aside = branded ? parts.slice(1).join(' · ') : raw
  if (!aside || aside.localeCompare('MassForge', 'pt-BR', { sensitivity: 'accent' }) === 0) return ''
  return aside
}

function letterheadLine(text: string, width: number) {
  const aside = letterheadAside(text)
  const tab = aside ? `<w:tabs><w:tab w:val="right" w:pos="${width}"/></w:tabs>` : ''
  const asideRun = aside
    ? `<w:r><w:tab/></w:r><w:r><w:rPr><w:color w:val="676B66"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>${xml(aside)}</w:t></w:r>`
    : ''
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="34532F"/></w:pBdr>${tab}<w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:color w:val="34532F"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>MassForge</w:t></w:r>${asideRun}</w:p>`
}

function letterheadFooter(text: string, numbered: boolean, width: number) {
  const tab = numbered ? `<w:tabs><w:tab w:val="right" w:pos="${width}"/></w:tabs>` : ''
  const number = numbered
    ? `<w:r><w:tab/></w:r><w:r><w:rPr><w:color w:val="34532F"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="34532F"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="34532F"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`
    : ''
  return `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="A9BF9C"/></w:pBdr>${tab}</w:pPr><w:r><w:rPr><w:color w:val="676B66"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>${number}</w:p>`
}

function wordWatermark() {
  const side = 3840480
  return `<w:p><w:r><w:drawing>
    <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>
      <wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>
      <wp:extent cx="${side}" cy="${side}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="1" name="Marca dagua"/>
      <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="${WATERMARK_FILE}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rIdMark"><a:alphaModFix amt="85000"/></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${side}" cy="${side}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing></w:r></w:p>`
}

function wordStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`
}

function wordTable(rows: number, cols: number, header: boolean) {
  const trs = []
  for (let row = 0; row < rows + (header ? 1 : 0); row += 1) {
    const cells = []
    for (let col = 0; col < cols; col += 1) {
      const text = header && row === 0 ? `Coluna ${col + 1}` : `R${Math.max(row, 1)}C${col + 1}`
      cells.push(`<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`)
    }
    trs.push(`<w:tr>${cells.join('')}</w:tr>`)
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${trs.join('')}</w:tbl>`
}

function chartTable(points: { label: string; value: number }[]) {
  const rows = [`<w:tr><w:tc><w:p><w:r><w:t>Ponto</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr>`]
  for (const point of points) {
    rows.push(`<w:tr><w:tc><w:p><w:r><w:t>${xml(point.label)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${point.value}</w:t></w:r></w:p></w:tc></w:tr>`)
  }
  return `<w:tbl>${rows.join('')}</w:tbl>`
}

function wordImage(relId: string, cx: number, cy: number) {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Imagem"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

function coreProps(meta: DocMeta) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(meta.titulo)}</dc:title><dc:creator>${xml(meta.autor)}</dc:creator></cp:coreProperties>`
}

type Cell = string | number | { formula: string }
type Sheet = { name: string; rows: Cell[][]; comments: { ref: string; author: string; text: string }[]; charts: { type: string; anchorRow: number; points: number }[] }

function sheetName(value: string, used: Set<string>) {
  let name = (value || 'Planilha').replace(/[[\]\\/?*]/g, ' ').trim().slice(0, 31) || 'Planilha'
  const base = name
  let index = 2
  while (used.has(name.toLocaleLowerCase('pt-BR'))) {
    name = `${base.slice(0, 28)} ${index}`
    index += 1
  }
  used.add(name.toLocaleLowerCase('pt-BR'))
  return name
}

function colLetter(index: number) {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

async function buildXlsx(options: { components: DocComponent[]; meta: DocMeta; seed: number }, notes: string[]): Promise<Built> {
  const factor = factorOf(options.meta)
  const used = new Set<string>()
  const sheets: Sheet[] = []
  const ensure = () => {
    if (!sheets.length) {
      sheets.push({ name: sheetName('Dados', used), rows: [], comments: [], charts: [] })
      notes.push('Havia conteúdo antes da primeira aba. Foi criada a aba Dados.')
    }
    return sheets[sheets.length - 1]
  }
  for (const component of options.components) {
    const props = component.props
    if (component.type === 'aba') {
      const rows = Math.max(1, countOf(props.linhas, 20))
      const cols = Math.max(1, countOf(props.colunas, 6))
      assertBudget(0, rows, cols)
      const sheet: Sheet = { name: sheetName(String(props.nome || 'Planilha'), used), rows: [], comments: [], charts: [] }
      const header: Cell[] = Array.from({ length: cols }, (_, index) => `Coluna ${index + 1}`)
      sheet.rows.push(header)
      for (let row = 1; row <= rows; row += 1) sheet.rows.push(Array.from({ length: cols }, (_, col) => (col === 0 ? row : row * (col + 1))))
      sheets.push(sheet)
    } else if (component.type === 'tabela') {
      const sheet = ensure()
      const rows = Math.max(1, countOf(props.linhas, 5)) * factor
      const cols = Math.max(1, countOf(props.colunas, 3))
      assertBudget(0, rows, cols)
      if (props.cab !== false) sheet.rows.push(Array.from({ length: cols }, (_, index) => `Coluna ${index + 1}`))
      for (let row = 1; row <= rows; row += 1) sheet.rows.push(Array.from({ length: cols }, () => `v${row}`))
    } else if (component.type === 'formula') {
      const sheet = ensure()
      const amount = Math.max(1, countOf(props.qtd, 3))
      const start = sheet.rows.length + 1
      for (let index = 0; index < amount; index += 1) sheet.rows.push([index + 1])
      const end = start + amount - 1
      const func = String(props.func || 'SOMA')
      const formula = excelFormula(func, start, end, sheets.some((item) => item.name.toLocaleLowerCase('pt-BR') === 'resumo'))
      sheet.rows.push([func, { formula }])
      if (props.erro) sheet.rows.push(['erro', { formula: '1/0' }])
    } else if (component.type === 'grafico') {
      const sheet = ensure()
      const points = Math.max(1, Math.min(countOf(props.pontos, 6), 50))
      const anchor = sheet.rows.length
      sheet.rows.push(['Ponto', 'Valor'])
      for (const point of series(options.seed + anchor, points)) sheet.rows.push([point.label, point.value])
      sheet.charts.push({ type: String(props.tipo || 'Barras'), anchorRow: anchor + 1, points })
    } else if (component.type === 'comentario') {
      const sheet = ensure()
      const row = Math.max(1, sheet.rows.length)
      if (!sheet.rows.length) sheet.rows.push(['Comentário'])
      sheet.comments.push({
        ref: `A${row}`,
        author: String(props.autor || options.meta.autor || 'QA'),
        text: String(props.texto || ''),
      })
    } else if (component.type === 'imagem') {
      const sheet = ensure()
      sheet.rows.push(['Imagem', 'A prévia visual da imagem fica no Word, PowerPoint e PDF. Nesta planilha o componente registra a legenda.'])
      if (props.legenda !== false) notes.push('No Excel, a imagem entra como registro na planilha. A figura incorporada está nos formatos Word, PowerPoint e PDF.')
    }
  }
  if (!sheets.length) {
    notes.push('Planilha mínima, sem componentes.')
    sheets.push({ name: 'Dados', rows: [[options.meta.titulo || 'MassForge']], comments: [], charts: [] })
  }
  const zip = new JSZip()
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
  ]
  const workbookRels: string[] = []
  sheets.forEach((sheet, index) => {
    const n = index + 1
    overrides.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    workbookRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`)
    const rels: string[] = []
    if (sheet.comments.length) {
      overrides.push(`<Override PartName="/xl/comments${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`)
      rels.push(`<Relationship Id="rIdC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${n}.xml"/>`)
      zip.file(`xl/comments${n}.xml`, commentsXml(sheet.comments))
    }
    sheet.charts.forEach((chart, chartIndex) => {
      const id = chartIndex + 1
      overrides.push(`<Override PartName="/xl/charts/chart${n}_${id}.xml" ContentType="application/vnd.openxmlformats.org/drawingml/2006/chart+xml"/>`)
      overrides.push(`<Override PartName="/xl/drawings/drawing${n}_${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
      rels.push(`<Relationship Id="rIdD${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}_${id}.xml"/>`)
      zip.file(`xl/charts/chart${n}_${id}.xml`, chartXml(sheet.name, chart))
      zip.file(`xl/drawings/drawing${n}_${id}.xml`, drawingXml())
      zip.file(`xl/drawings/_rels/drawing${n}_${id}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}_${id}.xml"/></Relationships>`)
    })
    if (rels.length) {
      zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
    }
    zip.file(`xl/worksheets/sheet${n}.xml`, sheetXml(sheet))
  })
  workbookRels.push(`<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`)
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join('')}</Relationships>`)
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`)
  zip.file('docProps/core.xml', coreProps(options.meta))
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    bytes,
    filename: safeFile(options.meta.nome, 'xlsx'),
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    notes,
  }
}

function excelFormula(func: string, start: number, end: number, hasSummary: boolean) {
  if (func === 'MÉDIA') return `AVERAGE(A${start}:A${end})`
  if (func === 'SE') return `IF(A${start}>0,1,0)`
  if (func === 'CONT.SE') return `COUNTIF(A${start}:A${end},">0")`
  if (func === 'PROCV') return hasSummary ? `VLOOKUP(A${start},Resumo!A1:B8,2,FALSE)` : 'NA()'
  return `SUM(A${start}:A${end})`
}

function sheetXml(sheet: Sheet) {
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const ref = `${colLetter(colIndex)}${rowIndex + 1}`
      if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
      if (typeof cell === 'object') return `<c r="${ref}"><f>${xml(cell.formula)}</f></c>`
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const drawing = sheet.charts.length ? ` r:id="rIdD1"` : ''
  const legacy = sheet.comments.length ? '<legacyDrawing r:id="rIdC"/>' : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${sheet.charts.length ? `<drawing${drawing}/>` : ''}${legacy}</worksheet>`
}

function commentsXml(comments: { ref: string; author: string; text: string }[]) {
  const authors = [...new Set(comments.map((comment) => comment.author))]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors>${authors.map((author) => `<author>${xml(author)}</author>`).join('')}</authors><commentList>${comments.map((comment) => `<comment ref="${comment.ref}" authorId="${authors.indexOf(comment.author)}"><text><t>${xml(comment.text)}</t></text></comment>`).join('')}</commentList></comments>`
}

function chartXml(sheetName: string, chart: { type: string; anchorRow: number; points: number }) {
  const end = chart.anchorRow + chart.points
  const cats = `'${sheetName}'!$A$${chart.anchorRow + 1}:$A$${end}`
  const vals = `'${sheetName}'!$B$${chart.anchorRow + 1}:$B$${end}`
  const kind = chart.type === 'Pizza' ? 'pieChart' : chart.type === 'Linhas' ? 'lineChart' : 'barChart'
  const extra = kind === 'barChart' ? '<c:barDir val="col"/><c:grouping val="clustered"/>' : kind === 'lineChart' ? '<c:grouping val="standard"/>' : ''
  const axes = kind === 'pieChart' ? '' : `<c:axId val="10"/><c:axId val="20"/>`
  const axisXml = kind === 'pieChart' ? '' : `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="20"/></c:catAx><c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="10"/></c:valAx>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart>
    <c:plotArea>
      <c:${kind}>${extra}<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Série</c:v></c:tx><c:cat><c:strRef><c:f>${xml(cats)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(vals)}</c:f></c:numRef></c:val></c:ser>${axes}</c:${kind}>
      ${axisXml}
    </c:plotArea>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`
}

function drawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Gráfico"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
}

type Slide = { title: string; body: string[]; layout: string }

async function buildPptx(options: { components: DocComponent[]; meta: DocMeta; seed: number; imagePng?: Uint8Array }, notes: string[]): Promise<Built> {
  const slides: Slide[] = []
  const ensure = () => {
    if (!slides.length) {
      slides.push({ title: options.meta.titulo || 'Slide', body: [], layout: 'Título e conteúdo' })
      notes.push('Havia conteúdo antes do primeiro slide. Foi criado um slide inicial.')
    }
    return slides[slides.length - 1]
  }
  let image = false
  for (const component of options.components) {
    const props = component.props
    if (component.type === 'slide') {
      slides.push({ title: '', body: [], layout: String(props.layout || 'Título e conteúdo') })
    } else if (component.type === 'titulo') {
      const slide = ensure()
      slide.title = String(props.texto || '')
    } else if (component.type === 'subtitulo') {
      ensure().body.push(String(props.texto || ''))
    } else if (component.type === 'paragrafo') {
      const amount = Math.max(1, countOf(props.qtd, 1)) * factorOf(options.meta)
      assertBudget(amount, 0, 0)
      for (let index = 0; index < amount; index += 1) ensure().body.push(paragraphText(index, props.tam))
    } else if (component.type === 'lista') {
      const amount = Math.max(1, countOf(props.itens, 4))
      for (let index = 0; index < amount; index += 1) ensure().body.push(`${props.tipo === 'Numerada' ? `${index + 1}. ` : '• '}${LIST_ITEMS[index % LIST_ITEMS.length]}`)
    } else if (component.type === 'tabela' || component.type === 'grafico') {
      if (component.type === 'grafico') notes.push('No PowerPoint, o gráfico entra como lista de pontos da série.')
      const points = component.type === 'grafico'
        ? series(options.seed, Math.max(1, Math.min(countOf(props.pontos, 6), 12)))
        : []
      if (points.length) {
        for (const point of points) ensure().body.push(`${point.label}: ${point.value}`)
      } else {
        ensure().body.push(`Tabela ${countOf(props.linhas, 5) * factorOf(options.meta)}×${countOf(props.colunas, 3)}`)
      }
    } else if (component.type === 'link') {
      ensure().body.push(`${props.texto || 'Link'}: ${props.url || ''}`)
    } else if (component.type === 'imagem') {
      image = true
      ensure().body.push(props.legenda === false ? 'Imagem' : 'Imagem com legenda')
    } else if (component.type === 'rodape') {
      ensure().body.push(String(props.texto || ''))
    }
  }
  if (!slides.length) {
    notes.push('Apresentação mínima, sem slides informados.')
    slides.push({ title: options.meta.titulo || 'MassForge', body: ['Dados fictícios para teste.'], layout: 'Título e conteúdo' })
  }
  const zip = new JSZip()
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${image ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${slideOverrides}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`)
  zip.file('docProps/core.xml', coreProps(options.meta))
  const presentationRels = [
    '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
    ...slides.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`),
  ]
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels.join('')}</Relationships>`)
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>
  <p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('')}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="widescreen"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`)
  zip.file('ppt/slideMasters/slideMaster1.xml', emptySlideXml('master'))
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
  zip.file('ppt/slideLayouts/slideLayout1.xml', emptySlideXml('layout'))
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
  slides.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(slide, image))
    const rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>']
    if (image && options.imagePng) rels.push('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image.png"/>')
    zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
  })
  if (image && options.imagePng) zip.file('ppt/media/image.png', options.imagePng)
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    bytes,
    filename: safeFile(options.meta.nome, 'pptx'),
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    notes,
  }
}

function emptySlideXml(kind: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld${kind === 'master' ? 'Master' : 'Layout'} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld${kind === 'master' ? 'Master' : 'Layout'}>`
}

function slideXml(slide: Slide, image: boolean) {
  const shapes = [textShape(2, 'Título', 457200, 274638, 8229600, 1143000, slide.title || ' ', 3200)]
  if (slide.layout !== 'Título' && slide.layout !== 'Em branco') {
    shapes.push(textShape(3, 'Conteúdo', 457200, 1600200, 8229600, 4114800, slide.body.join('\n') || ' ', 1800))
  } else if (slide.layout === 'Em branco' && slide.body.length) {
    shapes.push(textShape(3, 'Conteúdo', 457200, 1600200, 8229600, 4114800, slide.body.join('\n'), 1800))
  }
  const picture = image
    ? `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Imagem"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="8686800" y="1600200"/><a:ext cx="2743200" cy="1548000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.join('')}${picture}</p:spTree></p:cSld>
</p:sld>`
}

function textShape(id: number, name: string, x: number, y: number, cx: number, cy: number, text: string, size: number) {
  const paragraphs = text.split('\n').map((line) => `<a:p><a:r><a:rPr lang="pt-BR" sz="${size}" dirty="0"/><a:t>${xml(line)}</a:t></a:r></a:p>`).join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
}

function pdfSafe(value: string) {
  let out = ''
  for (const char of value.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0
    if (code === 10) out += '\n'
    else if (code >= 32 && code <= 255 && !(code >= 127 && code <= 159)) out += char
    else out += '?'
  }
  return out
}

async function buildPdf(options: { components: DocComponent[]; meta: DocMeta; seed: number; imagePng?: Uint8Array }, notes: string[]): Promise<Built> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const portrait = options.meta.pagina === 'Carta' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 }
  const size = options.meta.orient === 'Paisagem' ? { width: portrait.height, height: portrait.width } : portrait
  const header = options.components.find((component) => component.type === 'cabecalho')
  const footer = options.components.find((component) => component.type === 'rodape')
  const margin = 48
  const bodyTop = () => size.height - 56
  let page = doc.addPage([size.width, size.height])
  let y = bodyTop()
  const pages = [page]
  const markPng = await doc.embedPng(await loadWatermark())
  const paintMark = (target: typeof page) => {
    const side = Math.min(size.width, size.height) * 0.62
    target.drawImage(markPng, {
      x: (size.width - side) / 2,
      y: (size.height - side) / 2,
      width: side,
      height: side,
      opacity: 0.9,
    })
  }
  paintMark(page)
  const paintChrome = (target: typeof page, index: number) => {
    const top = size.height - 28
    target.drawText('MassForge', { x: margin, y: top, size: 11, font: bold, color: rgb(0.2, 0.33, 0.18) })
    const aside = letterheadAside(header ? String(header.props.texto || '') : '')
    if (aside) {
      const safe = pdfSafe(aside)
      const width = font.widthOfTextAtSize(safe, 9)
      target.drawText(safe, { x: size.width - margin - width, y: top + 1, size: 9, font, color: rgb(0.4, 0.42, 0.4) })
    }
    target.drawLine({
      start: { x: margin, y: size.height - 36 },
      end: { x: size.width - margin, y: size.height - 36 },
      thickness: 1,
      color: rgb(0.2, 0.33, 0.18),
    })
    if (footer) {
      target.drawLine({
        start: { x: margin, y: 36 },
        end: { x: size.width - margin, y: 36 },
        thickness: 0.6,
        color: rgb(0.66, 0.75, 0.61),
      })
      target.drawText(pdfSafe(String(footer.props.texto || '')), { x: margin, y: 22, size: 9, font, color: rgb(0.4, 0.42, 0.4) })
      if (footer.props.num !== false) {
        const num = String(index + 1)
        const width = bold.widthOfTextAtSize(num, 9)
        target.drawText(num, { x: size.width - margin - width, y: 22, size: 9, font: bold, color: rgb(0.2, 0.33, 0.18) })
      }
    }
  }
  const need = (height: number) => {
    if (y - height < margin + 20) {
      page = doc.addPage([size.width, size.height])
      pages.push(page)
      paintMark(page)
      y = bodyTop()
    }
  }
  const write = (text: string, options?: { size?: number; bold?: boolean; gap?: number }) => {
    const sizePx = options?.size ?? 11
    const face = options?.bold ? bold : font
    const lines = pdfSafe(text).split('\n')
    for (const line of lines) {
      const chunks = wrap(line, face, sizePx, size.width - margin * 2)
      for (const chunk of chunks) {
        need(sizePx + 4)
        page.drawText(chunk, { x: margin, y: y - sizePx, size: sizePx, font: face, color: rgb(0.18, 0.19, 0.18) })
        y -= sizePx + 4
      }
    }
    y -= options?.gap ?? 6
  }
  let paragraphs = 0
  let embedded: Awaited<ReturnType<typeof doc.embedPng>> | null = null
  for (const component of options.components) {
    const props = component.props
    if (component.type === 'cabecalho' || component.type === 'rodape') continue
    if (component.type === 'quebra') {
      page = doc.addPage([size.width, size.height])
      pages.push(page)
      paintMark(page)
      y = bodyTop()
      continue
    }
    if (component.type === 'titulo') write(String(props.texto || options.meta.titulo), { size: props.nivel === 'H3' ? 14 : props.nivel === 'H2' ? 16 : 20, bold: true, gap: 10 })
    else if (component.type === 'subtitulo') write(String(props.texto || ''), { size: 14, bold: true })
    else if (component.type === 'paragrafo') {
      const amount = Math.max(1, countOf(props.qtd, 1)) * factorOf(options.meta)
      paragraphs += amount
      assertBudget(paragraphs, 0, 0)
      for (let index = 0; index < amount; index += 1) write(paragraphText(index, props.tam))
    } else if (component.type === 'lista') {
      const amount = Math.max(1, countOf(props.itens, 4))
      for (let index = 0; index < amount; index += 1) {
        write(`${props.tipo === 'Numerada' ? `${index + 1}.` : '-'} ${LIST_ITEMS[index % LIST_ITEMS.length]}`, { gap: 2 })
      }
    } else if (component.type === 'tabela') {
      const rows = Math.max(1, countOf(props.linhas, 5)) * factorOf(options.meta)
      const cols = Math.max(1, countOf(props.colunas, 3))
      assertBudget(paragraphs, rows, cols)
      if (props.cab !== false) write(Array.from({ length: cols }, (_, index) => `Coluna ${index + 1}`).join(' | '), { bold: true, gap: 2 })
      for (let row = 1; row <= rows; row += 1) write(Array.from({ length: cols }, (_, col) => `R${row}C${col + 1}`).join(' | '), { gap: 1 })
    } else if (component.type === 'grafico') {
      const points = series(options.seed, Math.max(1, Math.min(countOf(props.pontos, 6), 12)))
      write(`Gráfico de ${String(props.tipo || 'Barras')}`, { bold: true })
      const max = Math.max(...points.map((point) => point.value), 1)
      for (const point of points) {
        need(16)
        const width = ((size.width - margin * 2 - 40) * point.value) / max
        page.drawRectangle({ x: margin + 36, y: y - 12, width: Math.max(2, width), height: 8, color: rgb(0.37, 0.5, 0.33) })
        page.drawText(pdfSafe(point.label), { x: margin, y: y - 12, size: 9, font })
        y -= 16
      }
    } else if (component.type === 'link') {
      const label = pdfSafe(String(props.texto || props.url || 'link'))
      need(16)
      const width = font.widthOfTextAtSize(label, 11)
      page.drawText(label, { x: margin, y: y - 11, size: 11, font, color: rgb(0.2, 0.33, 0.18) })
      const annot = doc.context.register(doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [margin, y - 14, margin + width, y],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(String(props.url || 'https://exemplo.com.br')) },
      }))
      const existing = page.node.lookup(PDFName.of('Annots'))
      void existing
      page.node.set(PDFName.of('Annots'), doc.context.obj([annot]))
      y -= 20
    } else if (component.type === 'imagem') {
      if (!options.imagePng) throw new Error('A imagem de exemplo não foi carregada.')
      if (!embedded) embedded = await doc.embedPng(options.imagePng)
      const maxWidth = size.width - margin * 2
      const scale = Math.min(1, maxWidth / embedded.width, 220 / embedded.height)
      const width = embedded.width * scale
      const height = embedded.height * scale
      need(height + 16)
      page.drawImage(embedded, { x: margin, y: y - height, width, height })
      y -= height + 8
      if (props.legenda !== false) write('Figura. Imagem fictícia para teste.', { size: 9 })
    }
  }
  if (doc.getPageCount() === 1 && y > size.height - margin - 20) {
    write(options.meta.titulo || 'Documento de teste')
    notes.push('PDF mínimo, sem componentes no corpo.')
  }
  pages.forEach((item, index) => paintChrome(item, index))
  doc.setTitle(options.meta.titulo)
  doc.setAuthor(options.meta.autor)
  const bytes = await doc.save()
  return { bytes, filename: safeFile(options.meta.nome, 'pdf'), mime: 'application/pdf', notes }
}

function wrap(line: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, maxWidth: number) {
  if (!line) return ['']
  const words = line.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}
