// Números e valores › fórmulas e gráficos: expressões, fórmulas de planilha, pontos no plano cartesiano
// e pontos de função. Tudo é montado e calculado aqui (árvore própria), sem avaliar texto.
import type { GeneratedItem } from './export.ts'

export const MATH_TIPOS = ['Expressão', 'Fórmula de planilha', 'Ponto cartesiano', 'Pontos de função'] as const
export type MathConfig = Record<string, unknown>
type Random = () => number

export function isMathTipo(tipo: unknown) {
  return (MATH_TIPOS as readonly string[]).includes(String(tipo))
}

// Campos da tela de Números que continuam valendo em cada tipo novo (os demais somem).
const KEEP: Record<string, string[]> = {
  'Expressão': ['tipo', 'complexidade', 'regraExpr', 'qtd'],
  'Fórmula de planilha': ['tipo', 'idioma', 'regraForm', 'qtd'],
  'Ponto cartesiano': ['tipo', 'quadrante', 'min', 'max', 'casas', 'sep', 'qtd'],
  'Pontos de função': ['tipo', 'funcao', 'min', 'max', 'casas', 'sep', 'qtd'],
}

export function mathFieldVisible(key: string, config: MathConfig) {
  const keep = KEEP[String(config.tipo)]
  return !keep || keep.includes(key)
}

export const MATH_DEFAULTS = {
  complexidade: 'Com parênteses',
  regraExpr: 'Válida',
  idioma: 'Português',
  regraForm: 'Válida',
  quadrante: 'Qualquer',
  funcao: 'Linear',
}

export const MATH_FIELDS = [
  { k: 'complexidade', label: 'Complexidade', type: 'seg', opts: ['Simples', 'Com parênteses', 'Com potência'], show: (v: MathConfig) => v.tipo === 'Expressão' },
  { k: 'regraExpr', label: 'Regra a testar', type: 'sel', opts: ['Válida', 'Divisão por zero', 'Parênteses desbalanceados', 'Operador inválido'], show: (v: MathConfig) => v.tipo === 'Expressão' },
  { k: 'idioma', label: 'Idioma da planilha', type: 'seg', opts: ['Português', 'Inglês'], show: (v: MathConfig) => v.tipo === 'Fórmula de planilha', help: 'Português usa ponto e vírgula entre argumentos (Excel e LibreOffice em pt-BR).' },
  { k: 'regraForm', label: 'Regra a testar', type: 'sel', opts: ['Válida', 'Referência inválida', 'Função inexistente', 'Sintaxe quebrada'], show: (v: MathConfig) => v.tipo === 'Fórmula de planilha' },
  { k: 'quadrante', label: 'Posição', type: 'sel', opts: ['Qualquer', '1º quadrante', '2º quadrante', '3º quadrante', '4º quadrante', 'Sobre os eixos', 'Origem'], show: (v: MathConfig) => v.tipo === 'Ponto cartesiano', help: 'Mínimo e máximo limitam x e y. Nos quadrantes vale o tamanho do intervalo, com o sinal do quadrante.' },
  { k: 'funcao', label: 'Função', type: 'seg', opts: ['Linear', 'Quadrática', 'Seno', 'Exponencial'], show: (v: MathConfig) => v.tipo === 'Pontos de função', help: 'Os pontos vão de x = mínimo a x = máximo, igualmente espaçados; a quantidade é o número de pontos.' },
]

function item(tag: string, tone: string, rule: string, fields: [string, string, string][]): GeneratedItem {
  return { tag, tone, rule, checks: [[tag, tone]], fields: fields.map(([k, key, v]) => ({ k, key, v })) }
}

const int = (r: Random, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: Random, list: readonly T[]) => list[Math.floor(r() * list.length)]

function formatter(config: MathConfig) {
  const places = Math.max(0, Math.min(4, Number.parseInt(String(config.casas ?? '2'), 10) || 0))
  const comma = config.sep !== 'Ponto'
  const fmt = (value: number) => {
    const fixed = (Object.is(Math.round(value * 10 ** places) / 10 ** places, -0) ? 0 : value).toFixed(places)
    return comma ? fixed.replace('.', ',') : fixed
  }
  return { fmt, pair: (x: number, y: number) => `(${fmt(x)}${comma ? '; ' : ', '}${fmt(y)})`, places }
}

// ---------- Expressão ----------
type Node = { op: string; left: Node; right: Node } | { n: number }
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }

function value(node: Node): number {
  if ('n' in node) return node.n
  const a = value(node.left)
  const b = value(node.right)
  switch (node.op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return a / b
    default: return a ** b
  }
}

function print(node: Node, parent = 0, right = false): string {
  if ('n' in node) return node.n < 0 ? `(${node.n})` : String(node.n)
  const prec = PREC[node.op]
  const text = `${print(node.left, prec)} ${node.op === '*' ? '×' : node.op === '/' ? '÷' : node.op} ${print(node.right, prec, true)}`
  const wrap = prec < parent || (right && prec === parent && node.op !== '^')
  return wrap ? `(${text})` : text
}

function leaf(r: Random): Node {
  return { n: int(r, 1, 20) }
}

function tree(r: Random, level: string): Node {
  const op = () => pick(r, ['+', '-', '*', '/'] as const)
  const safe = (node: Node): Node => {
    // Divisor nunca vale zero numa expressão válida.
    if (!('n' in node) && node.op === '/' && value(node.right) === 0) return { ...node, right: { n: int(r, 1, 9) } }
    return node
  }
  if (level === 'Simples') return safe({ op: '+', left: safe({ op: op(), left: leaf(r), right: leaf(r) }), right: leaf(r) })
  if (level === 'Com potência') {
    return safe({ op: pick(r, ['+', '-'] as const), left: { op: '^', left: { n: int(r, 2, 9) }, right: { n: int(r, 2, 3) } }, right: safe({ op: op(), left: safe({ op: pick(r, ['+', '-'] as const), left: leaf(r), right: leaf(r) }), right: leaf(r) }) })
  }
  return safe({ op: op(), left: safe({ op: pick(r, ['+', '-'] as const), left: leaf(r), right: leaf(r) }), right: safe({ op: pick(r, ['+', '-', '*'] as const), left: leaf(r), right: leaf(r) }) })
}

function shown(result: number) {
  const rounded = Math.round(result * 10000) / 10000
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

function expressionItem(config: MathConfig, r: Random): GeneratedItem {
  const level = String(config.complexidade || 'Com parênteses')
  const rule = String(config.regraExpr || 'Válida')
  const root = tree(r, level === 'Simples' ? 'Simples' : level === 'Com potência' ? 'Com potência' : 'Com parênteses')
  const text = print(root)
  if (rule === 'Divisão por zero') {
    const a = int(r, 2, 9)
    return item('divisão por zero', 'bad', 'divisao_zero', [['Expressão', 'expressao', `${text} ÷ (${a} - ${a})`], ['Resultado', 'resultado', 'indefinido'], ['Regra aplicada', 'regra', 'O divisor vale zero; o sistema precisa recusar ou avisar.']])
  }
  if (rule === 'Parênteses desbalanceados') {
    const broken = text.includes(')') ? text.replace(/\)(?!.*\))/, '') : `(${text}`
    return item('parênteses desbalanceados', 'bad', 'parenteses', [['Expressão', 'expressao', broken], ['Resultado', 'resultado', 'erro de sintaxe'], ['Regra aplicada', 'regra', 'Falta fechar ou abrir um parêntese.']])
  }
  if (rule === 'Operador inválido') {
    const broken = text.replace(/ ([+\-×÷^]) /, (_, op: string) => ` ${op} ${pick(r, ['×', '÷', '+'])} `)
    return item('operador inválido', 'bad', 'operador', [['Expressão', 'expressao', broken], ['Resultado', 'resultado', 'erro de sintaxe'], ['Regra aplicada', 'regra', 'Dois operadores seguidos, sem número entre eles.']])
  }
  return item('expressão válida', 'ok', 'valida', [['Expressão', 'expressao', text], ['Resultado', 'resultado', shown(value(root))], ['Regra aplicada', 'regra', `${level}; ordem: potência, depois × e ÷, depois + e −.`]])
}

// ---------- Fórmula de planilha ----------
const FUNCS = {
  Português: { SUM: 'SOMA', AVERAGE: 'MÉDIA', MAX: 'MÁXIMO', MIN: 'MÍNIMO', COUNTIF: 'CONT.SE', IF: 'SE', VLOOKUP: 'PROCV', ROUND: 'ARRED', FALSE: 'FALSO', sep: ';', dec: ',' },
  Inglês: { SUM: 'SUM', AVERAGE: 'AVERAGE', MAX: 'MAX', MIN: 'MIN', COUNTIF: 'COUNTIF', IF: 'IF', VLOOKUP: 'VLOOKUP', ROUND: 'ROUND', FALSE: 'FALSE', sep: ',', dec: '.' },
}

function formulaItem(config: MathConfig, r: Random): GeneratedItem {
  const lang = config.idioma === 'Inglês' ? 'Inglês' : 'Português'
  const f = FUNCS[lang]
  const col = () => pick(r, ['A', 'B', 'C', 'D', 'E', 'F'])
  const c1 = col()
  const a = int(r, 1, 9)
  const b = a + int(r, 5, 40)
  const range = `${c1}${a}:${c1}${b}`
  const templates: [string, string][] = [
    [f.SUM, `=${f.SUM}(${range})`],
    [f.AVERAGE, `=${f.AVERAGE}(${range})`],
    [f.MAX, `=${f.MAX}(${range})`],
    [f.MIN, `=${f.MIN}(${range})`],
    [f.COUNTIF, `=${f.COUNTIF}(${range}${f.sep}">=${int(r, 10, 99)}")`],
    [f.IF, `=${f.IF}(${c1}${a}>${int(r, 10, 500)}${f.sep}"Alto"${f.sep}"Baixo")`],
    [f.VLOOKUP, `=${f.VLOOKUP}(${c1}${a}${f.sep}${lang === 'Português' ? 'Planilha2' : 'Sheet2'}!A:B${f.sep}2${f.sep}${f.FALSE})`],
    [f.ROUND, `=${f.ROUND}(${c1}${a}*1${f.dec}${int(r, 10, 99)}${f.sep}2)`],
  ]
  const [name, formula] = pick(r, templates)
  const rule = String(config.regraForm || 'Válida')
  if (rule === 'Referência inválida') {
    const broken = pick(r, [formula.replace(range, `${c1}0:${c1}${b}`), formula.replace(/\(([A-Z]+\d+)/, '(#REF!')])
    return item('referência inválida', 'bad', 'referencia', [['Fórmula', 'formula', broken === formula ? `=${f.SUM}(#REF!)` : broken], ['Função', 'funcao', name], ['Idioma', 'idioma', lang], ['Regra aplicada', 'regra', 'Linha 0 ou #REF! não existem; a planilha mostra #REF!.']])
  }
  if (rule === 'Função inexistente') {
    return item('função inexistente', 'bad', 'funcao', [['Fórmula', 'formula', formula.replace(name, `${name}AR`)], ['Função', 'funcao', `${name}AR`], ['Idioma', 'idioma', lang], ['Regra aplicada', 'regra', 'Nome de função que a planilha não conhece; resulta em #NOME?.']])
  }
  if (rule === 'Sintaxe quebrada') {
    const broken = pick(r, [formula.replace(/\)$/, ''), formula.replace(/^=/, ''), formula.replaceAll(f.sep, lang === 'Português' ? ',' : ';')])
    return item('sintaxe quebrada', 'bad', 'sintaxe', [['Fórmula', 'formula', broken === formula ? formula.replace(/\)$/, '') : broken], ['Função', 'funcao', name], ['Idioma', 'idioma', lang], ['Regra aplicada', 'regra', 'Sem "=", sem fechar parêntese ou com separador do outro idioma.']])
  }
  return item('fórmula válida', 'ok', 'valida', [['Fórmula', 'formula', formula], ['Função', 'funcao', name], ['Idioma', 'idioma', lang], ['Regra aplicada', 'regra', `Separador de argumentos "${f.sep}".`]])
}

// ---------- Plano cartesiano ----------
function quadrantOf(x: number, y: number) {
  if (x === 0 && y === 0) return 'Origem'
  if (x === 0) return 'Eixo Y'
  if (y === 0) return 'Eixo X'
  if (x > 0) return y > 0 ? '1º quadrante' : '4º quadrante'
  return y > 0 ? '2º quadrante' : '3º quadrante'
}

function pointItem(x: number, y: number, config: MathConfig, extra: [string, string, string][] = []): GeneratedItem {
  const { fmt, pair } = formatter(config)
  const place = quadrantOf(Number(fmt(x).replace(',', '.')), Number(fmt(y).replace(',', '.')))
  return item(place.toLowerCase(), 'ok', 'ponto', [['Ponto', 'ponto', pair(x, y)], ['X', 'x', fmt(x)], ['Y', 'y', fmt(y)], ['Posição', 'posicao', place], ...extra])
}

function cartesian(config: MathConfig, r: Random, count: number) {
  const min = Number(config.min)
  const max = Number(config.max)
  const { places } = formatter(config)
  const snap = (value: number) => Math.round(value * 10 ** places) / 10 ** places
  const span = Math.max(Math.abs(min), Math.abs(max), 1)
  const mag = () => snap(Math.max(10 ** -places, r() * span))
  const quad = String(config.quadrante || 'Qualquer')
  return Array.from({ length: count }, () => {
    if (quad === 'Origem') return pointItem(0, 0, config)
    if (quad === 'Sobre os eixos') return r() < 0.5 ? pointItem(snap(min + r() * (max - min)) || mag(), 0, config) : pointItem(0, snap(min + r() * (max - min)) || mag(), config)
    const signs: Record<string, [number, number]> = { '1º quadrante': [1, 1], '2º quadrante': [-1, 1], '3º quadrante': [-1, -1], '4º quadrante': [1, -1] }
    const sign = signs[quad]
    if (sign) return pointItem(sign[0] * mag(), sign[1] * mag(), config)
    return pointItem(snap(min + r() * (max - min)), snap(min + r() * (max - min)), config)
  })
}

function functionPoints(config: MathConfig, r: Random, count: number) {
  const min = Number(config.min)
  const max = Number(config.max)
  const kind = String(config.funcao || 'Linear')
  const a = int(r, 1, 5) * (r() < 0.3 ? -1 : 1)
  const b = int(r, -6, 6)
  const c = int(r, -9, 9)
  const k = int(r, 1, 5) / 10
  const signed = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`)
  const spec: Record<string, { label: string; f: (x: number) => number }> = {
    Linear: { label: `y = ${a}x ${signed(b)}`, f: (x) => a * x + b },
    Quadrática: { label: `y = ${a}x² ${signed(b)}x ${signed(c)}`, f: (x) => a * x * x + b * x + c },
    Seno: { label: `y = ${a}·sen(${Math.abs(b) || 1}x)`, f: (x) => a * Math.sin((Math.abs(b) || 1) * x) },
    Exponencial: { label: `y = ${Math.abs(a)}·e^(${k.toLocaleString('pt-BR')}x)`, f: (x) => Math.abs(a) * Math.exp(k * x) },
  }
  const chosen = spec[kind] ?? spec.Linear
  return Array.from({ length: count }, (_, index) => {
    const x = count === 1 ? min : min + ((max - min) * index) / (count - 1)
    return pointItem(x, chosen.f(x), config, [['Função', 'funcao', chosen.label]])
  })
}

export function mathRun(config: MathConfig, r: Random): GeneratedItem[] {
  const count = Math.max(1, Math.min(Number(config.qtd) || 1, 1000))
  if (config.tipo === 'Expressão') return Array.from({ length: count }, () => expressionItem(config, r))
  if (config.tipo === 'Fórmula de planilha') return Array.from({ length: count }, () => formulaItem(config, r))
  if (config.tipo === 'Ponto cartesiano') return cartesian(config, r, count)
  return functionPoints(config, r, count)
}
