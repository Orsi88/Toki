import { eanCheck } from '../symbols.ts'
import { bad, emptyInput, lines, ok, verdict, warn, type Check, type Outcome } from './verdict.ts'

// Conferência de sintaxe dos formatos estruturados, apontando linha e coluna do primeiro erro.

function position(text: string, offset: number) {
  const before = text.slice(0, Math.max(0, offset))
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}

function where(text: string, offset: number) {
  const { line, column } = position(text, offset)
  return `linha ${line}, coluna ${column}`
}

export function checkJson(text: string): Check[] {
  try {
    const value = JSON.parse(text)
    const kind = Array.isArray(value) ? `lista com ${value.length} ${value.length === 1 ? 'item' : 'itens'}` : value === null ? 'null' : typeof value === 'object' ? `objeto com ${Object.keys(value).length} chaves` : typeof value
    const checks = [ok('Sintaxe', `JSON válido: ${kind}.`)]
    const duplicated = duplicateJsonKeys(text)
    if (duplicated.length) checks.push(warn('Chaves repetidas', `A mesma chave aparece duas vezes no mesmo objeto: ${duplicated.slice(0, 5).join(', ')}. O último valor vence.`))
    if (text.charCodeAt(0) === 0xfeff) checks.push(warn('BOM', 'Começa com BOM; alguns leitores de JSON recusam.'))
    return checks
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const match = /position (\d+)/.exec(message)
    const detail = match ? `${message.replace(/ in JSON at position \d+.*$/, '')} (${where(text, Number(match[1]))}).` : `${message}.`
    const hints: string[] = []
    if (/,\s*[}\]]/.test(text)) hints.push('vírgula sobrando antes de } ou ]')
    if (/'[^']*'\s*:/.test(text)) hints.push('aspas simples nas chaves')
    if (/[{,]\s*[A-Za-z_]\w*\s*:/.test(text)) hints.push('chave sem aspas')
    return [bad('Sintaxe', hints.length ? `${detail} Provável causa: ${hints.join('; ')}.` : detail)]
  }
}

function duplicateJsonKeys(text: string) {
  const found = new Set<string>()
  const stack: Set<string>[] = []
  const pattern = /"((?:[^"\\]|\\.)*)"\s*:|[{}[\]]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match[0] === '{') stack.push(new Set())
    else if (match[0] === '}') stack.pop()
    else if (match[1] !== undefined && stack.length) {
      const keys = stack[stack.length - 1]
      if (keys.has(match[1])) found.add(match[1])
      keys.add(match[1])
    }
  }
  return [...found]
}

const NAME = /^[A-Za-z_:][\w:.-]*$/

export function checkXml(text: string): Check[] {
  const source = text.replace(/^\ufeff/, '')
  const stack: { name: string; at: number }[] = []
  let roots = 0
  let index = 0
  const fail = (detail: string, at: number) => [bad('Sintaxe', `${detail} (${where(source, at)}).`)]
  while (index < source.length) {
    const open = source.indexOf('<', index)
    const textPart = source.slice(index, open < 0 ? source.length : open)
    if (!stack.length && textPart.trim() && roots > 0) return fail('Texto fora do elemento raiz', index)
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(textPart)) return fail('& sem entidade válida; use &amp;', index + textPart.search(/&/))
    if (open < 0) break
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4)
      if (end < 0) return fail('Comentário sem -->', open)
      index = end + 3
      continue
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open)
      if (end < 0) return fail('CDATA sem ]]>', open)
      index = end + 3
      continue
    }
    if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open)
      if (end < 0) return fail('Instrução <? sem ?>', open)
      index = end + 2
      continue
    }
    if (source.startsWith('<!', open)) {
      const end = source.indexOf('>', open)
      if (end < 0) return fail('Declaração <! sem >', open)
      index = end + 1
      continue
    }
    const close = findTagEnd(source, open)
    if (close < 0) return fail('Tag sem >', open)
    const raw = source.slice(open + 1, close)
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim()
      const top = stack.pop()
      if (!top) return fail(`</${name}> fecha uma tag que não foi aberta`, open)
      if (top.name !== name) return fail(`</${name}> fecha <${top.name}>, aberta na ${where(source, top.at)}`, open)
    } else {
      const selfClosing = raw.endsWith('/')
      const body = selfClosing ? raw.slice(0, -1) : raw
      const name = body.trim().split(/\s+/)[0] ?? ''
      if (!NAME.test(name)) return fail(`Nome de tag inválido: <${name}>`, open)
      const attrs = body.trim().slice(name.length)
      const seen = new Set<string>()
      const attrPattern = /\s*([^\s=]+)\s*(=\s*("[^"]*"|'[^']*'|[^\s"']+))?/g
      let attr: RegExpExecArray | null
      while ((attr = attrPattern.exec(attrs)) && attr[0].trim()) {
        if (!attr[2]) return fail(`Atributo ${attr[1]} sem valor em <${name}>`, open)
        if (!/^["']/.test(attr[3])) return fail(`Atributo ${attr[1]} sem aspas em <${name}>`, open)
        if (seen.has(attr[1])) return fail(`Atributo ${attr[1]} repetido em <${name}>`, open)
        seen.add(attr[1])
      }
      if (!stack.length) {
        roots += 1
        if (roots > 1) return fail(`Mais de um elemento raiz: <${name}>`, open)
      }
      if (!selfClosing) stack.push({ name, at: open })
    }
    index = close + 1
  }
  if (stack.length) {
    const top = stack[stack.length - 1]
    return fail(`<${top.name}> não foi fechada`, top.at)
  }
  if (!roots) return [bad('Sintaxe', 'Nenhum elemento encontrado.')]
  return [ok('Sintaxe', 'XML bem formado, com um elemento raiz.')]
}

function findTagEnd(source: string, from: number) {
  let quote = ''
  for (let index = from + 1; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '>') return index
    else if (char === '<') return -1
  }
  return -1
}

export function splitCsv(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let openedAt = -1
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') {
      quoted = true
      openedAt = index
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return { rows: rows.filter((item) => item.some((value) => value !== '')), openQuote: quoted ? openedAt : -1 }
}

export function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t', '|'].map((char) => [char, first.split(char).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

export function checkCsv(text: string): Check[] {
  const source = text.replace(/^\ufeff/, '')
  const delimiter = detectDelimiter(source)
  const name = { ',': 'vírgula', ';': 'ponto e vírgula', '\t': 'tabulação', '|': 'barra vertical' }[delimiter] ?? delimiter
  const { rows, openQuote } = splitCsv(source, delimiter)
  if (openQuote >= 0) return [bad('Sintaxe', `Aspas abertas e não fechadas (${where(source, openQuote)}).`)]
  if (!rows.length) return [bad('Sintaxe', 'Nenhuma linha de dados.')]
  const checks: Check[] = [ok('Sintaxe', `${rows.length} linhas separadas por ${name}.`)]
  const width = rows[0].length
  const uneven = rows.map((row, index) => [index + 1, row.length] as const).filter(([, size]) => size !== width)
  checks.push(uneven.length
    ? bad('Colunas', `O cabeçalho tem ${width} colunas, mas ${uneven.length} ${uneven.length === 1 ? 'linha tem' : 'linhas têm'} outra quantidade (linha ${uneven[0][0]}: ${uneven[0][1]}).`)
    : ok('Colunas', `Todas as linhas com ${width} colunas.`))
  const header = rows[0].map((cell) => cell.trim())
  const repeated = header.filter((cell, index) => cell && header.indexOf(cell) !== index)
  if (repeated.length) checks.push(warn('Cabeçalho', `Colunas com o mesmo nome: ${[...new Set(repeated)].join(', ')}.`))
  if (header.some((cell) => !cell)) checks.push(warn('Cabeçalho', 'Há coluna sem nome no cabeçalho.'))
  if (text.charCodeAt(0) === 0xfeff) checks.push(ok('Codificação', 'Começa com BOM UTF-8, o que ajuda o Excel a ler acentos.'))
  return checks
}

export function checkYaml(text: string): Check[] {
  const rows = text.split(/\r?\n/)
  const tab = rows.findIndex((line) => /^\t+/.test(line))
  if (tab >= 0) return [bad('Sintaxe', `Indentação com tabulação na linha ${tab + 1}; YAML só aceita espaços.`)]
  const issues: string[] = []
  const keysByIndent = new Map<number, Set<string>>()
  rows.forEach((line, index) => {
    if (!line.trim() || line.trim().startsWith('#')) return
    const indent = line.length - line.trimStart().length
    for (const level of [...keysByIndent.keys()]) if (level > indent) keysByIndent.delete(level)
    const body = line.trim().replace(/^-\s+/, '')
    if (line.trim().startsWith('- ')) keysByIndent.delete(indent + 2)
    const key = /^([^:#'"]+|"[^"]*"|'[^']*'):(\s|$)/.exec(body)?.[1]
    if (key) {
      const set = keysByIndent.get(indent) ?? new Set<string>()
      if (set.has(key)) issues.push(`chave "${key}" repetida na linha ${index + 1}`)
      set.add(key)
      keysByIndent.set(indent, set)
    } else if (!line.trim().startsWith('- ') && !/^[\]}|>]/.test(body) && index > 0 && !/:\s*[|>]?\s*$/.test(rows[index - 1] ?? '')) {
      issues.push(`linha ${index + 1} sem "chave: valor"`)
    }
    const quotes = (body.match(/"/g) ?? []).length
    if (quotes % 2) issues.push(`aspas sem fechar na linha ${index + 1}`)
  })
  if (issues.length) return [bad('Sintaxe', `${issues.slice(0, 3).join('; ')}.`)]
  return [ok('Sintaxe', 'Indentação com espaços, chaves únicas por nível e aspas fechadas.'), warn('Alcance', 'Conferência básica de YAML: tipos e âncoras não são avaliados.')]
}

export function checkSql(text: string): Check[] {
  const statements: string[] = []
  let current = ''
  let quote = ''
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === quote && text[index + 1] === quote) {
        current += char + char
        index += 1
        continue
      }
      if (char === quote) quote = ''
    } else if (char === "'" || char === '"') quote = char
    else if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth < 0) return [bad('Sintaxe', `Parêntese fechado sem abrir (${where(text, index)}).`)]
    } else if (char === ';' && depth === 0) {
      statements.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (quote) return [bad('Sintaxe', 'Aspas abertas e não fechadas.')]
  if (depth > 0) return [bad('Sintaxe', 'Parêntese aberto e não fechado.')]
  const checks: Check[] = []
  if (current.trim()) {
    statements.push(current.trim())
    checks.push(warn('Terminação', 'A última instrução não termina com ;.'))
  }
  const insert = /^insert\s+into\s+[\w."`[\]]+\s*\(([^)]*)\)\s*values\s*([\s\S]+)$/i
  statements.forEach((statement, index) => {
    const match = insert.exec(statement)
    if (!match) return
    const columns = match[1].split(',').length
    for (const group of match[2].match(/\((?:[^()']|'(?:[^']|'')*')*\)/g) ?? []) {
      const values = splitCsv(group.slice(1, -1), ',').rows[0]?.length ?? 0
      if (values !== columns) {
        checks.push(bad('Colunas', `Instrução ${index + 1}: ${columns} colunas e ${values} valores.`))
        return
      }
    }
  })
  const known = /^(select|insert|update|delete|create|alter|drop|with|merge|truncate|begin|commit|rollback|grant|revoke)\b/i
  const unknown = statements.filter((statement) => !known.test(statement))
  if (unknown.length) checks.push(warn('Comandos', `Instrução que não começa com um comando SQL conhecido: "${unknown[0].slice(0, 40)}".`))
  if (statements.some((statement) => /^(delete|update)\b(?![\s\S]*\bwhere\b)/i.test(statement))) checks.push(warn('Segurança', 'UPDATE ou DELETE sem WHERE altera a tabela inteira.'))
  return [ok('Sintaxe', `${statements.length} ${statements.length === 1 ? 'instrução' : 'instruções'} com aspas e parênteses balanceados.`), ...checks]
}

export function checkBarcode(value: string): Check[] {
  const digits = value.replace(/\s/g, '')
  if (/^\d{13}$/.test(digits)) {
    const expected = eanCheck(digits.slice(0, 12))
    return Number(digits[12]) === expected ? [ok('EAN-13', 'Dígito verificador confere.')] : [bad('EAN-13', `O dígito verificador certo seria ${expected}.`)]
  }
  if (/^\d{8}$/.test(digits)) {
    const sum = digits.slice(0, 7).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 1 : 3), 0)
    const expected = (10 - (sum % 10)) % 10
    return Number(digits[7]) === expected ? [ok('EAN-8', 'Dígito verificador confere.')] : [bad('EAN-8', `O dígito verificador certo seria ${expected}.`)]
  }
  if (/^\d{12}$/.test(digits)) {
    const expected = eanCheck(`0${digits.slice(0, 11)}`)
    return Number(digits[11]) === expected ? [ok('UPC-A', 'Dígito verificador confere.')] : [bad('UPC-A', `O dígito verificador certo seria ${expected}.`)]
  }
  if (/^[\x20-\x7e]+$/.test(value)) return [ok('Code 128', 'Só caracteres ASCII imprimíveis: cabe num Code 128.'), warn('Dígito', 'O texto do Code 128 não carrega dígito verificador; ele vai no símbolo.')]
  return [bad('Formato', 'Não é EAN-8, EAN-13, UPC-A nem texto ASCII para Code 128.')]
}

export function detectFormat(text: string) {
  const trimmed = text.trim()
  if (/^[[{]/.test(trimmed)) return 'JSON'
  if (trimmed.startsWith('<')) return 'XML'
  if (/^(select|insert|update|delete|create|alter|drop|with)\b/i.test(trimmed)) return 'SQL'
  if (/^\d{8,13}$/.test(trimmed.replace(/\s/g, ''))) return 'Código de barras'
  const first = trimmed.split(/\r?\n/, 1)[0]
  if (/^(---|[\w"'-]+:\s|-\s)/.test(first) && !/[,;\t]/.test(first)) return 'YAML'
  return 'CSV'
}

export function validateStructured(text: string, format: string): Outcome {
  if (!text.trim()) return emptyInput('Cole o conteúdo, envie um arquivo ou leia a imagem de um QR Code.')
  const chosen = format === 'Detectar' ? detectFormat(text) : format
  const labels = { ok: `${chosen} válido`, bad: `${chosen} inválido`, warn: `${chosen} com ressalva` }
  const detected = format === 'Detectar' ? [ok('Formato', `Detectado como ${chosen}.`)] : []
  if (chosen === 'Código de barras') return { verdicts: lines(text).map((line) => verdict(line, checkBarcode(line), { ok: 'Código válido', bad: 'Código inválido', warn: 'Código com ressalva' })) }
  const checks = chosen === 'JSON' ? checkJson(text) : chosen === 'XML' ? checkXml(text) : chosen === 'YAML' ? checkYaml(text) : chosen === 'SQL' ? checkSql(text) : checkCsv(text)
  return { verdicts: [verdict(`${text.trim().slice(0, 80)}${text.trim().length > 80 ? '…' : ''}`, [...detected, ...checks], labels)] }
}
