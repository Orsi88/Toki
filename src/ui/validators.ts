import { EVENT_AREAS, EVENT_RULES, eventRows, validateEvents, type EventKind } from '../domain/events.ts'
import { generateFiles } from '../domain/files.ts'
import { coordinateRows } from '../domain/geo.ts'
import { validateCoords, GEO_REGIONS } from '../domain/inspect/coords.ts'
import { profileDataset } from '../domain/inspect/dataset.ts'
import { DATE_FORMATS, validateDates } from '../domain/inspect/dates.ts'
import { inspectFiles, type InFile } from '../domain/inspect/files.ts'
import { validateFinance } from '../domain/inspect/finance.ts'
import { NUMBER_STYLES, validateNumbers } from '../domain/inspect/numbers.ts'
import { validatePeople } from '../domain/inspect/people.ts'
import { validateStructured } from '../domain/inspect/structured.ts'
import { validateEdges, validateText } from '../domain/inspect/text.ts'
import type { Outcome } from '../domain/inspect/verdict.ts'
import { ENG, FILE_DEF, cpfD, fmtCpf, rng, setReferenceDate } from '../domain/mfEngine.ts'
import type { EngineField } from './Fields.tsx'
import type { TypeOption } from './TypePicker.tsx'

type Config = Record<string, unknown>
export type ValidatorInput = { text: string; files: InFile[] }
export type ValidatorSpec = {
  intro: string
  // Escolha de tipo mostrada como cartões com ícone, acima dos outros campos.
  picker?: { key: string; label: string; options: TypeOption[] }
  fields: EngineField[]
  defaults: Config
  usesDate?: string
  input: 'text' | 'files'
  heading: (config: Config) => string
  hint: (config: Config) => string
  placeholder?: (config: Config) => string
  qrImages?: boolean
  accept?: string
  examples: (config: Config, day: Date) => Promise<{ text?: string; files?: InFile[] }>
  run: (input: ValidatorInput, config: Config, day: Date) => Promise<Outcome>
  keywords: string
}

const random = () => rng(Math.floor(Math.random() * 1_000_000_000))
const text = (value: unknown) => String(value ?? '')

type Engine = { run: (config: Config, random: () => number) => { fields: { key: string; v: string }[] }[] }
function engineValues(id: string, config: Config, key: string) {
  const engine = (ENG as unknown as Record<string, Engine>)[id]
  return engine.run({ ...(ENG as unknown as Record<string, { def: Config }>)[id].def, ...config }, random()).map((item) => item.fields.find((field) => field.key === key)?.v ?? '').filter(Boolean)
}

async function fileExamples(set: 'arquivos' | 'documentos'): Promise<InFile[]> {
  const make = async (sel: string, extra: Config = {}) => (await generateFiles({ ...FILE_DEF, sel: [sel], qtd: 1, tam: 4, unid: 'KB', ...extra } as never, Math.floor(Math.random() * 1e9)))[0].bytes
  const { default: JSZip } = await import('jszip')
  const docx = await make('DOCX')
  const zip = await JSZip.loadAsync(docx)
  zip.file('word/vbaProject.bin', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))
  const withMacro = await zip.generateAsync({ type: 'uint8array' })
  const pdf = await make('PDF')
  if (set === 'documentos') {
    return [
      { name: 'relatorio.pdf', bytes: pdf },
      { name: 'contrato.docx', bytes: docx },
      { name: 'planilha.xlsx', bytes: await make('XLSX') },
      { name: 'proposta-com-macro.docx', bytes: withMacro },
      { name: 'relatorio-corrompido.pdf', bytes: await make('PDF', { conteudo: 'Corrompido' }) },
      { name: 'contrato-truncado.docx', bytes: await make('DOCX', { conteudo: 'Truncado' }) },
    ]
  }
  return [
    { name: 'foto.png', bytes: await make('PNG') },
    { name: 'documento.pdf', bytes: pdf },
    { name: 'foto-truncada.jpg', bytes: await make('JPG', { conteudo: 'Truncado' }) },
    { name: 'nota.pdf', bytes: await make('PDF', { conteudo: 'Extensão divergente', real: 'PNG' }) },
    { name: 'fatura.pdf.exe', bytes: pdf },
    { name: 'planilha-com-macro.docx', bytes: withMacro },
    { name: 'audio.wav', bytes: await make('WAV') },
    { name: 'vazio.txt', bytes: new Uint8Array() },
  ]
}

const fileSpec = (set: 'arquivos' | 'documentos'): ValidatorSpec => ({
  intro: 'O investigador lê o conteúdo e não confia no nome: descobre o tipo real, confere a estrutura e procura macro, script, executável e objeto embutido.',
  fields: [],
  defaults: {},
  input: 'files',
  heading: () => 'Envie os arquivos',
  hint: () => 'Um ou vários. Nada sai do navegador: a análise roda aqui.',
  examples: async () => ({ files: await fileExamples(set) }),
  run: async (input) => input.files.length ? { verdicts: await inspectFiles(input.files) } : { verdicts: [], error: 'Envie ao menos um arquivo.' },
  keywords: 'investigar arquivo corrompido macro vba executável extensão tipo real assinatura magic bytes zip bomb pdf javascript',
})

export const VALIDATORS: Record<string, ValidatorSpec> = {
  arquivos: fileSpec('arquivos'),
  documentos: fileSpec('documentos'),
  textos: {
    intro: 'Conta como cada sistema conta (caracteres, visíveis, UTF-16 e bytes) e acha o que quebra: invisíveis, emojis, homóglifos e padrões de injeção.',
    fields: [
      { k: 'unidade', label: 'Medir o limite em', type: 'seg', opts: ['Caracteres', 'Caracteres visíveis', 'Unidades UTF-16', 'Bytes UTF-8'], help: 'VARCHAR do MySQL conta caracteres; o do Oracle e o do SQL Server, bytes ou UTF-16.' },
      { k: 'min', label: 'Mínimo', type: 'txt' },
      { k: 'max', label: 'Máximo', type: 'txt', help: 'Vazio não confere limite.' },
    ],
    defaults: { unidade: 'Caracteres', min: '', max: '255' },
    input: 'text',
    heading: () => 'Cole o texto',
    hint: () => 'O texto inteiro é analisado como um valor só.',
    examples: async () => ({ text: 'Ação “café” 🦊👩\u200d💻 com espaço\u00a0não separável e um zero\u200bwidth. Раypal parece Paypal. <script>alert(1)</script>' }),
    run: async (input, config) => validateText(input.text, { unidade: text(config.unidade), min: text(config.min), max: text(config.max) }),
    keywords: 'texto caracteres contar bytes utf-8 emoji invisível limite',
  },
  pessoais: {
    intro: 'Confere cada valor pela regra oficial: dígitos do CPF e do CNPJ (inclusive alfanumérico), DDD, faixa do CEP, formato do e-mail e idade.',
    picker: { key: 'tipo', label: 'Tipo', options: [
      { value: 'Detectar', label: 'Detectar', desc: 'Descobre o tipo de cada linha.', icon: 'detectar' },
      { value: 'CPF', label: 'CPF', desc: 'Dígitos e região fiscal.', icon: 'cpf' },
      { value: 'CNPJ', label: 'CNPJ', desc: 'Numérico ou alfanumérico.', icon: 'cnpj' },
      { value: 'E-mail', label: 'E-mail', desc: 'Usuário, domínio e tamanho.', icon: 'email' },
      { value: 'Telefone', label: 'Telefone', desc: 'DDD, celular ou fixo.', icon: 'telefone' },
      { value: 'CEP', label: 'CEP', desc: 'Formato e faixa da região.', icon: 'cep' },
      { value: 'Nascimento', label: 'Nascimento', desc: 'Data existe e idade.', icon: 'nascimento' },
      { value: 'Nome', label: 'Nome', desc: 'Partes, caracteres e caixa.', icon: 'nome' },
    ] },
    fields: [],
    defaults: { tipo: 'Detectar' },
    usesDate: 'Data de referência',
    input: 'text',
    heading: () => 'Cole os valores',
    hint: () => 'Um por linha. Pode misturar tipos com Detectar.',
    placeholder: () => '529.982.247-25\nana@exemplo.com.br\n(11) 98765-4321',
    examples: async () => {
      const r = random()
      const cpf = cpfD(r, 'SP').join('')
      const wrong = cpf.slice(0, 10) + ((Number(cpf[10]) + 1) % 10)
      return { text: [fmtCpf(cpf, true), wrong, '11.222.333/0001-81', '12.ABC.345/01DE-35', 'ana.silva@exemplo.com.br', 'ana.silva@@exemplo', '(11) 98765-4321', '(20) 8765-4321', '01310-100', '00000-000', '29/02/2023', '15/08/1990', 'Ana Beatriz Silva', 'J0ão 123'].join('\n') }
    },
    run: async (input, config, day) => validatePeople(input.text, text(config.tipo), day),
    keywords: 'cpf cnpj email e-mail telefone cep nome nascimento documento',
  },
  numeros: {
    intro: 'Lê o número no formato brasileiro ou internacional e confere intervalo, casas decimais, inteiro, estouro de 32 bits e precisão. Cores em HEX e RGB também.',
    fields: [
      { k: 'estilo', label: 'Formato', type: 'seg', opts: NUMBER_STYLES },
      { k: 'min', label: 'Mínimo', type: 'txt' },
      { k: 'max', label: 'Máximo', type: 'txt' },
      { k: 'casas', label: 'Casas decimais (máximo)', type: 'txt' },
      { k: 'inteiro', label: 'Só inteiros', type: 'tog' },
    ],
    defaults: { estilo: 'Detectar', min: '0', max: '100', casas: '2', inteiro: false },
    input: 'text',
    heading: () => 'Cole os números',
    hint: () => 'Um por linha. Aceita R$, % e cores (#RRGGBB, rgb()).',
    examples: async () => ({ text: ['42', '100', '100,01', '-1', '1.234,56', '1,234.56', 'R$ 99,90', '50%', '3,14159', '007', '2147483648', '#5E7F55', 'rgb(300, 0, 0)', 'doze'].join('\n') }),
    run: async (input, config) => validateNumbers(input.text, { estilo: text(config.estilo), min: text(config.min), max: text(config.max), casas: text(config.casas), inteiro: Boolean(config.inteiro) }),
    keywords: 'numero número decimal inteiro intervalo moeda porcentagem cor hex rgb',
  },
  financeiro: {
    intro: 'Cartão (Luhn, bandeira, validade, CVV), PIX (chave ou copia e cola com CRC16) e boleto (linha digitável, código de barras e contas de consumo).',
    picker: { key: 'tipo', label: 'Tipo', options: [
      { value: 'Detectar', label: 'Detectar', desc: 'Descobre o tipo de cada linha.', icon: 'detectar' },
      { value: 'Cartão', label: 'Cartão', desc: 'Luhn, bandeira, validade e CVV.', icon: 'cartao' },
      { value: 'PIX', label: 'PIX', desc: 'Chave ou copia e cola com CRC16.', icon: 'pix' },
      { value: 'Boleto', label: 'Boleto', desc: 'Linha digitável e código de barras.', icon: 'boleto' },
    ] },
    fields: [],
    defaults: { tipo: 'Detectar' },
    usesDate: 'Data de referência',
    input: 'text',
    qrImages: true,
    heading: () => 'Cole os valores ou leia o QR do PIX',
    hint: () => 'Um por linha. No cartão, dá para pôr validade e CVV na mesma linha: 4111 1111 1111 1111 12/30 123.',
    examples: async () => {
      setReferenceDate(new Date())
      const cards = engineValues('cartao', { qtd: 2 }, 'numero_cartao')
      const pix = engineValues('pix', { qtd: 1, payload: true, valor: '25,00' }, 'payload')
      const boletos = engineValues('boleto', { qtd: 1 }, 'linha')
      const broken = pix[0] ? pix[0].slice(0, -4) + (pix[0].endsWith('0000') ? '1111' : '0000') : ''
      return { text: [...cards, '4111 1111 1111 1112', '5555 5555 5555 4444 13/24 123', ...pix, broken, '+5511987654321', '11987654321', ...boletos, boletos[0] ? boletos[0].replace(/\d(?=\D*$)/, (digit) => String((Number(digit) + 1) % 10)) : ''].filter(Boolean).join('\n') }
    },
    run: async (input, config, day) => validateFinance(input.text, text(config.tipo), day),
    keywords: 'cartão cartao luhn pix copia e cola crc boleto linha digitável código de barras',
  },
  estruturados: {
    intro: 'Confere a sintaxe e aponta linha e coluna do erro: JSON, XML, CSV, YAML e SQL. Lê o conteúdo de QR Codes e confere o dígito de códigos de barras.',
    picker: { key: 'formato', label: 'Formato', options: [
      { value: 'Detectar', label: 'Detectar', desc: 'Descobre o formato.', icon: 'detectar' },
      { value: 'JSON', label: 'JSON', desc: 'Sintaxe e chaves repetidas.', icon: 'json' },
      { value: 'XML', label: 'XML', desc: 'Tags, atributos e raiz.', icon: 'xml' },
      { value: 'CSV', label: 'CSV', desc: 'Aspas e colunas por linha.', icon: 'csv' },
      { value: 'YAML', label: 'YAML', desc: 'Indentação e chaves.', icon: 'yaml' },
      { value: 'SQL', label: 'SQL', desc: 'Aspas, parênteses e INSERT.', icon: 'sql' },
      { value: 'Código de barras', label: 'Código de barras', desc: 'EAN, UPC e Code 128.', icon: 'boleto' },
    ] },
    fields: [],
    defaults: { formato: 'Detectar' },
    input: 'text',
    qrImages: true,
    accept: '.json,.xml,.csv,.yaml,.yml,.sql,.txt',
    heading: () => 'Cole o conteúdo',
    hint: () => 'Também dá para enviar o arquivo ou a imagem de um QR Code.',
    examples: async () => ({ text: '{\n  "id": 1,\n  "nome": "Ana",\n  "email": "ana@exemplo.com.br",\n  "ativo": true,\n}' }),
    run: async (input, config) => validateStructured(input.text, text(config.formato)),
    keywords: 'json xml csv yaml sql sintaxe qr code código de barras ean',
  },
  datas: {
    intro: 'Diz se a data existe (29/02, 31/04), o formato, o dia da semana, o fuso do ISO 8601, o instante de um timestamp e se cai no intervalo.',
    fields: [
      { k: 'formato', label: 'Formato esperado', type: 'sel', opts: DATE_FORMATS },
      { k: 'min', label: 'Mínimo (AAAA-MM-DD)', type: 'txt' },
      { k: 'max', label: 'Máximo (AAAA-MM-DD)', type: 'txt' },
    ],
    defaults: { formato: 'Detectar', min: '', max: '' },
    usesDate: 'Data de referência',
    input: 'text',
    heading: () => 'Cole as datas',
    hint: () => 'Uma por linha: datas, horários, ISO 8601 ou timestamp Unix.',
    examples: async () => ({ text: ['29/02/2024', '29/02/2023', '31/04/2026', '12/25/2026', '05/06/2026', '2026-11-02', '2026-11-02T14:30:00-03:00', '2026-11-02T14:30:00+15:00', '1767225600', '2147483648', '23:59:59', '24:00', '25:61'].join('\n') }),
    run: async (input, config, day) => validateDates(input.text, { formato: text(config.formato), min: text(config.min), max: text(config.max), day }),
    keywords: 'data datas horário timestamp iso fuso bissexto',
  },
  borda: {
    intro: 'Cada linha é um valor que um campo vai receber. Confere comprimento, valor, obrigatório, unicidade e os caracteres que costumam quebrar sistemas.',
    fields: [
      { k: 'unidade', label: 'Medir comprimento em', type: 'seg', opts: ['Caracteres', 'Bytes UTF-8'] },
      { k: 'min', label: 'Comprimento mínimo', type: 'txt' },
      { k: 'max', label: 'Comprimento máximo', type: 'txt' },
      { k: 'valorMin', label: 'Valor mínimo', type: 'txt' },
      { k: 'valorMax', label: 'Valor máximo', type: 'txt' },
      { k: 'obrigatorio', label: 'Campo obrigatório', type: 'tog' },
      { k: 'unico', label: 'Valores únicos', type: 'tog' },
    ],
    defaults: { unidade: 'Caracteres', min: '1', max: '10', valorMin: '', valorMax: '', obrigatorio: true, unico: true },
    input: 'text',
    heading: () => 'Cole os valores',
    hint: () => 'Um por linha. Linha vazia conta como valor vazio.',
    examples: async () => ({ text: ['123456789', '1234567890', '12345678901', '', 'null', "' OR '1'='1", 'Ação', 'ação', '  espaço', 'abc\u200bdef'].join('\n') }),
    run: async (input, config) => validateEdges(input.text, { unidade: text(config.unidade), min: text(config.min), max: text(config.max), valorMin: text(config.valorMin), valorMax: text(config.valorMax), obrigatorio: Boolean(config.obrigatorio), unico: Boolean(config.unico) }),
    keywords: 'borda limite comprimento máximo mínimo nulo vazio duplicado injeção',
  },
  mapas: {
    intro: 'Lê coordenadas em decimal, hemisfério ou graus-minutos-segundos e confere faixa, região, latitude e longitude invertidas, precisão e áreas.',
    fields: [
      { k: 'regiao', label: 'Região esperada', type: 'seg', opts: GEO_REGIONS },
      { k: 'latMin', label: 'Latitude mínima', type: 'num', show: (config) => config.regiao === 'Informada' },
      { k: 'latMax', label: 'Latitude máxima', type: 'num', show: (config) => config.regiao === 'Informada' },
      { k: 'lngMin', label: 'Longitude mínima', type: 'num', show: (config) => config.regiao === 'Informada' },
      { k: 'lngMax', label: 'Longitude máxima', type: 'num', show: (config) => config.regiao === 'Informada' },
    ],
    defaults: { regiao: 'Brasil', latMin: -23.8, latMax: -23.3, lngMin: -46.9, lngMax: -46.3 },
    input: 'text',
    heading: () => 'Cole as coordenadas',
    hint: () => 'Uma por linha: -23.5505, -46.6333 · 23.55° S, 46.63° O · 23°33\'01.8" S, 46°38\'00.0" O · área: sudoeste → nordeste.',
    examples: async () => {
      const valid = coordinateRows({ tipo: 'Ponto', formato: 'Decimal', regiao: 'Brasil', casas: '6', regra: 'Válida', random: random() }, 1)[0].value
      const gms = coordinateRows({ tipo: 'Ponto', formato: 'GMS', regiao: 'Brasil', casas: '6', regra: 'Válida', random: random() }, 1)[0].value
      return { text: [valid, gms, '23.5505° S, 46.6333° O', '-46.6333, -23.5505', '-23.55, -46.63', '48.8584, 2.2945', '91.2, -46.6', '0, 0', '-23,5505, -46,6333', '-23.8, -46.9 → -23.3, -46.3', '-23.3, -46.3 → -23.8, -46.9'].join('\n') }
    },
    run: async (input, config) => validateCoords(input.text, { regiao: text(config.regiao), latMin: Number(config.latMin), latMax: Number(config.latMax), lngMin: Number(config.lngMin), lngMax: Number(config.lngMax) }),
    keywords: 'mapa coordenada latitude longitude gps área região',
  },
  combinadas: {
    intro: 'Faz o perfil da massa: quantos registros, colunas desalinhadas, registros repetidos e, por coluna, tipo provável, vazios, repetidos e valores inválidos.',
    fields: [],
    defaults: {},
    input: 'text',
    accept: '.csv,.json,.txt',
    heading: () => 'Cole a massa ou envie o arquivo',
    hint: () => 'CSV (com cabeçalho) ou JSON (lista de objetos), como sai do Baixar CSV/JSON.',
    examples: async () => {
      const r = random()
      const cpf = () => fmtCpf(cpfD(r, 'SP').join(''), true)
      const repeated = cpf()
      return { text: ['id,nome,cpf,email,nascimento,ativo', `1,Ana Silva,${cpf()},ana@exemplo.com.br,15/08/1990,true`, `2,Bruno Lima,${repeated},bruno@exemplo.com.br,30/02/1985,false`, `3,Carla Souza,123.456.789-00,carla.exemplo.com.br,01/01/2000,sim`, `3,Diego Costa,${repeated},,12/12/1999,true`, `5,=HYPERLINK("http://x"),${cpf()},eva@exemplo.com.br,05/05/2005,true`].join('\n') }
    },
    run: async (input) => profileDataset(input.text),
    keywords: 'massa csv json colunas perfil duplicados vazios',
  },
  eventos: {
    picker: { key: 'tipo', label: 'O que conferir', options: [
      { value: 'Ingresso', label: 'Ingresso', desc: 'Catraca: assinatura, validade e reentrada.', icon: 'ingresso' },
      { value: 'Credencial', label: 'Credencial', desc: 'Portaria: função e área liberada.', icon: 'credencial' },
      { value: 'Inscrição', label: 'Inscrição', desc: 'Ficha: CPF, idade e pagamento.', icon: 'inscricao' },
      { value: 'Cupom', label: 'Cupom', desc: 'Dígito, vigência e usos.', icon: 'cupom' },
    ] },
    intro: 'Simula a portaria: confere a assinatura do QR, o evento, a validade, o status, a reentrada e, nas credenciais, a área. Inscrições: obrigatórios, CPF, e-mail, idade e pagamento.',
    fields: [
      { k: 'evento', label: 'Evento esperado', type: 'txt', help: 'Código do evento que a portaria aceita. Vazio pula essa conferência.' },
      { k: 'area', label: 'Área da portaria', type: 'sel', opts: EVENT_AREAS, show: (config) => config.tipo === 'Credencial' },
      { k: 'idadeMin', label: 'Idade mínima', type: 'num', show: (config) => config.tipo === 'Inscrição', presets: [0, 16, 18] },
    ],
    defaults: { tipo: 'Ingresso', evento: 'FEST-2026', area: 'Backstage', idadeMin: 18 },
    usesDate: 'Data do check-in',
    input: 'text',
    qrImages: true,
    accept: '.json',
    heading: (config) => config.tipo === 'Inscrição' ? 'Cole as fichas' : 'Cole os códigos ou envie os QR Codes',
    hint: (config) => config.tipo === 'Inscrição' ? 'JSON (objeto ou lista), como sai do Baixar JSON da tela de gerar.' : 'Um por linha: o conteúdo do QR ou, no cupom, só o código digitado.',
    placeholder: (config) => config.tipo === 'Inscrição' ? '[{ "nome": "...", "cpf": "...", "email": "...", "nascimento": "DD/MM/AAAA" }]' : 'MFT1|FEST-2026|TKT-...',
    examples: async (config, day) => {
      setReferenceDate(day)
      const tipo = config.tipo as EventKind
      const base = { tipo, evento: text(config.evento) || 'FEST-2026', nomeEvento: 'Festival de Testes 2026', area: text(config.area) || 'Geral', idadeMin: Number(config.idadeMin) || 0 }
      const r = random()
      const rows = EVENT_RULES[tipo].flatMap((regra) => eventRows({ ...base, regra }, r))
      if (tipo === 'Inscrição') return { text: JSON.stringify(rows.map((row) => Object.fromEntries(row.fields.filter(([, key]) => key !== 'regra').map(([, key, value]) => [key, value]))), null, 2) }
      const codes = rows.map((row) => row.fields.find(([, key]) => key === 'qr')?.[2] ?? '')
      if (tipo === 'Ingresso' && codes[0]) codes.push(codes[0])
      return { text: codes.join('\n') }
    },
    run: async (input, config, day) => validateEvents(input.text, { tipo: config.tipo as EventKind, evento: text(config.evento), data: day, area: text(config.area) || 'Geral', idadeMin: Number(config.idadeMin) || 0 }),
    keywords: 'ingresso ticket credencial check-in portaria cupom inscrição qr',
  },
}
