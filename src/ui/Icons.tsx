// Ícones de traço das categorias, no mesmo estilo da seta e da estrela da tela inicial.
const PATHS: Record<string, string> = {
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  text: 'M5 6h14 M12 6v13 M9 19h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0',
  hash: 'M5 9h14 M5 15h14 M10 4 8 20 M16 4l-2 16',
  card: 'M3.5 6.5h17v11h-17z M3.5 10.5h17 M7 14.5h4',
  code: 'M8 8l-4 4 4 4 M16 8l4 4-4 4 M13.5 5l-3 14',
  cal: 'M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4',
  alert: 'M12 4.5 3 19.5h18z M12 10v4.5 M12 17v.5',
  pin: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  ticket: 'M4 6.5h16v3.5a2 2 0 0 0 0 4v3.5H4V14a2 2 0 0 0 0-4z M14.5 6.5v11',
  layers: 'M12 4 3 8.5l9 4.5 9-4.5z M3 12.5l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
}

export function CategoryIcon({ name }: { name?: string }) {
  const path = PATHS[name ?? ''] ?? PATHS.layers
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Ícones das ações da aba Validar.
const ACTIONS: Record<string, string> = {
  examples: 'M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  upload: 'M12 15.5V4.5 M7.5 9 12 4.5 16.5 9 M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3',
  image: 'M4.5 5.5h15v13h-15z M4.5 15.5l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5 M14.5 9.5a1.2 1.2 0 1 0 0-.01z',
  phone: 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z M10.5 17.5h3',
  clear: 'M5.5 7h13 M10 7V5.5h4V7 M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7 M10.5 10.5v6 M13.5 10.5v6',
}

export function ActionIcon({ name }: { name: keyof typeof ACTIONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ACTIONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Ícones dos tipos escolhidos no topo das telas de Financeiro e Eventos.
const TYPES: Record<string, string> = {
  cartao: 'M3.5 6.5h17v11h-17z M3.5 10.5h17 M7 14.5h4',
  pix: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z M8.5 12h7 M12 8.5v7',
  bancario: 'M3.5 9.5 12 4.5l8.5 5 M5.5 9.5v8 M9.5 9.5v8 M14.5 9.5v8 M18.5 9.5v8 M3.5 19.5h17',
  boleto: 'M4.5 6v12 M7 6v12 M10 6v12 M12 6v12 M15 6v12 M17 6v12 M19.5 6v12',
  ingresso: 'M4 6.5h16v3.5a2 2 0 0 0 0 4v3.5H4V14a2 2 0 0 0 0-4z M14.5 6.5v11',
  credencial: 'M7 3.5h10v17H7z M10 3.5v2.5h4V3.5 M12 12.5a2 2 0 1 0 0-.01z M9.3 17.5a2.7 2.7 0 0 1 5.4 0',
  inscricao: 'M8.5 3.5h7v2.5h-7z M6.5 5h11v15.5h-11z M9 10.5h6 M9 13.5h6 M9 16.5h4',
  cupom: 'M3.5 12.5V4.5h8l9 9-8 8z M8 8.5a.6.6 0 1 0 0-.01z',
  detectar: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5l5 5',
  cpf: 'M3.5 6h17v12h-17z M8.5 12.5a1.8 1.8 0 1 0 0-.01z M6 16a2.5 2.5 0 0 1 5 0 M13.5 10.5h4.5 M13.5 13.5h3',
  cnpj: 'M5.5 20.5v-15h8v15 M13.5 9.5h5v11 M3.5 20.5h17 M8 8.5h1 M10.5 8.5h1 M8 11.5h1 M10.5 11.5h1 M8 14.5h1 M10.5 14.5h1 M16 12.5h.5 M16 15.5h.5',
  email: 'M3.5 6.5h17v11h-17z M3.5 7l8.5 6 8.5-6',
  telefone: 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z M10.5 17.5h3',
  cep: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  nascimento: 'M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4',
  nome: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0',
  json: 'M9 4.5c-2 0-2.5 1-2.5 2.5v2.5c0 1-.8 2-2 2.5 1.2.5 2 1.5 2 2.5V17c0 1.5.5 2.5 2.5 2.5 M15 4.5c2 0 2.5 1 2.5 2.5v2.5c0 1 .8 2 2 2.5-1.2.5-2 1.5-2 2.5V17c0 1.5-.5 2.5-2.5 2.5',
  xml: 'M8 8l-4 4 4 4 M16 8l4 4-4 4 M13.5 5l-3 14',
  csv: 'M4 5.5h16v13H4z M4 10h16 M4 14.5h16 M9.5 5.5v13',
  yaml: 'M8.5 7h11 M8.5 12h11 M8.5 17h11 M4.5 7h.5 M4.5 12h.5 M4.5 17h.5',
  sql: 'M5 6.5c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5-7-1.1-7-2.5z M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11 M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
  outros: 'M6.5 12h.5 M12 12h.5 M17.5 12h.5',
  inteiro: 'M5 9h14 M5 15h14 M10 4 8 20 M16 4l-2 16',
  decimal: 'M6.5 17.5v.5 M14 6.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z',
  monetario: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6 M12 6.5v1.5 M12 16v1.5',
  porcentagem: 'M18.5 5.5l-13 13 M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M16.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  sequencia: 'M4.5 7h1 M4.5 12h1 M4.5 17h1 M8.5 7h11 M8.5 12h11 M8.5 17h11',
  cor: 'M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z',
  comprimento: 'M3.5 15.5 15.5 3.5l5 5-12 12z M7 12l2 2 M10 9l2 2 M13 6l2 2',
  massa: 'M6.5 8.5h11l2 11h-15z M9.5 8.5a2.5 2.5 0 0 1 5 0',
  volume: 'M8 3.5h8 M9.5 3.5v6l-4.5 9a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2l-4.5-9v-6 M7 15h10',
  qr_code: 'M4.5 4.5h6v6h-6z M13.5 4.5h6v6h-6z M4.5 13.5h6v6h-6z M14 14h2v2h-2z M18 18h1.5v1.5H18z M14 18h1.5 M18 14h1.5',
  lista: 'M4.5 7h1 M4.5 12h1 M4.5 17h1 M8.5 7h11 M8.5 12h11 M8.5 17h11',
  hierarquia: 'M10 4.5h4v4h-4z M4.5 15.5h4v4h-4z M15.5 15.5h4v4h-4z M12 8.5V12 M6.5 15.5V12h11v3.5',
  serie: 'M4.5 19.5h15 M6.5 16l4-5 3 3 4.5-6',
  horario: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M12 7.5V12l3 2',
  data_e_hora: 'M4.5 6.5h11v10h-11z M4.5 10h11 M7.5 4.5v3 M12.5 4.5v3 M17.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M17.5 16v1.5l1 .7',
  timestamp_unix: 'M4.5 12h15 M4.5 12l3-3 M4.5 12l3 3 M19.5 7.5v9',
  iso_8601: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M3.5 12h17 M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z',
  historia: 'M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5z M19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z',
  sequencia_aleatoria: 'M4.5 4.5h15v15h-15z M9 9h.5 M14.5 9h.5 M9 14.5h.5 M14.5 14.5h.5 M12 12h.5',
  texto_repetitivo: 'M4.5 12a6 6 0 0 1 10.3-4.2L17.5 10 M17.5 5.5V10H13 M19.5 12a6 6 0 0 1-10.3 4.2L6.5 14 M6.5 18.5V14H11',
  padrao_personalizado: 'M4.5 7.5h15v9h-15z M8 12h.5 M11.5 12h.5 M15 12h.5',
  word: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M8.5 12l1.5 5 2-4 2 4 1.5-5',
  excel: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 12l6 6 M15 12l-6 6',
  powerpoint: 'M4.5 5.5h15v10h-15z M12 15.5v4 M8.5 19.5h7 M10 8.5h2.5a1.5 1.5 0 0 1 0 3H10V8.5v4.5',
  pdf: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M8.5 16.5h7 M8.5 13h7',
  comprimento_maximo: 'M3.5 12h17 M3.5 8.5v7 M20.5 8.5v7 M16.5 9 19.5 12l-3 3',
  comprimento_minimo: 'M3.5 12h17 M3.5 8.5v7 M20.5 8.5v7 M7.5 9 4.5 12l3 3',
  valor_maximo: 'M4.5 4.5h15 M12 19.5v-11 M8 12.5l4-4 4 4',
  valor_minimo: 'M4.5 19.5h15 M12 4.5v11 M8 11.5l4 4 4-4',
  nulo_e_vazio: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M6 18 18 6',
  caracteres_especiais: 'M15.5 12a3.5 3.5 0 1 1-1.5-2.9V13a1.8 1.8 0 0 0 3.5.5 7.5 7.5 0 1 0-3 6',
  valores_extremos: 'M12 4.5v15 M7.5 9 12 4.5 16.5 9 M7.5 15 12 19.5 16.5 15',
  duplicidade: 'M8.5 8.5h11v11h-11z M15.5 8.5v-4h-11v11h4',
  todas_as_variacoes: 'M12 4 3 8.5l9 4.5 9-4.5z M3 12.5l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  aleatoria_evp: 'M4.5 4.5h15v15h-15z M9 9h.5 M14.5 9h.5 M9 14.5h.5 M14.5 14.5h.5 M12 12h.5',
  estrutura_real: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 14.5l2 2 4-4',
  simulado: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M8.5 14.5c1-1 2-1 3.5 0s2.5 1 3.5 0',
  corrompido: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9.5 12.5l5 5 M14.5 12.5l-5 5',
  truncado: 'M14 3H7a2 2 0 0 0-2 2v8 M14 3v5h5v5 M5 16.5h2 M9.5 16.5h2 M14 16.5h2 M18.5 16.5h.5',
  extensao_divergente: 'M7 7.5h12l-3-3 M17 16.5H5l3 3',
}

export function TypeIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={TYPES[name] ?? TYPES.outros} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
