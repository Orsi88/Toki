import { FILE_DEF, fmtBytes } from '../mfEngine.ts'
import { estimateMediaBytes } from '../media.ts'
import {
  FILE_BYTE_LIMIT,
  FILE_COUNT_LIMIT,
  FILE_TOTAL_LIMIT,
  validateFileRequest,
  type FileRequest,
} from '../files.ts'
import { emptyPlan, planCase, type StrategyPlan } from './types.ts'

export const FILE_CONDITIONS = [
  { id: 'estrutura', label: 'Estrutura real' },
  { id: 'vazio', label: 'Vazio' },
  { id: 'corrompido', label: 'Corrompido' },
  { id: 'truncado', label: 'Truncado' },
  { id: 'divergente', label: 'Extensão divergente' },
] as const

export type FileConditionId = (typeof FILE_CONDITIONS)[number]['id']

export type FileSelection = { extension: string; condition: FileConditionId }

export type FileComboConfig = {
  extensions: string[]
  selected: FileSelection[]
  tam: number
  unid: 'B' | 'KB' | 'MB' | 'GB'
  real: string
  nome: string
}

export function defaultFileComboConfig(): FileComboConfig {
  return {
    extensions: ['TXT'],
    selected: [{ extension: 'TXT', condition: 'estrutura' }],
    tam: 1,
    unid: 'KB',
    real: 'PNG',
    nome: 'arquivo_teste',
  }
}

export function planFileCombos(config: FileComboConfig): StrategyPlan {
  const errors: string[] = []
  if (!config.extensions.length) errors.push('Selecione ao menos uma extensão.')
  if (!config.selected.length) errors.push('Marque ao menos uma combinação na grade.')
  if (!Number.isInteger(config.tam) || config.tam < 0) errors.push('O tamanho precisa ser um inteiro a partir de zero.')
  if (!['B', 'KB', 'MB', 'GB'].includes(config.unid)) errors.push('A unidade precisa ser B, KB, MB ou GB.')
  const selected = config.selected.filter((item) => config.extensions.includes(item.extension))
  if (selected.length > FILE_COUNT_LIMIT) {
    errors.push(`A grade tem ${selected.length} arquivos. O teto é ${FILE_COUNT_LIMIT}.`)
  }
  if (selected.some((item) => item.condition === 'divergente') && !config.real) {
    errors.push('Extensão divergente precisa do conteúdo real.')
  }
  if (errors.length) return emptyPlan(errors)

  let knownBytes = 0
  let unknown = false
  for (const item of selected) {
    const request = fileRequest(config, item)
    const error = validateFileRequest(request)
    if (error) errors.push(`${item.extension} · ${conditionLabel(item.condition)}: ${error}`)
    const estimate = estimateCombo(request, item.condition)
    if (estimate === null) unknown = true
    else knownBytes += estimate
  }
  if (knownBytes > FILE_TOTAL_LIMIT) {
    errors.push(`O lote conhecido soma cerca de ${fmtBytes(knownBytes)}. O teto é ${fmtBytes(FILE_TOTAL_LIMIT)}. Nada será gerado pela metade.`)
  }
  if (errors.length) return emptyPlan(errors, selected.length, 0)
  const cases = selected.map((item, index) => planCase(index + 1, [
    { key: 'extensao', label: 'Extensão', value: item.extension, bind: false },
    { key: 'condicao', label: 'Condição', value: conditionLabel(item.condition), bind: false },
    { key: 'tamanho', label: 'Tamanho', value: item.condition === 'vazio' ? '0 B' : item.condition === 'corrompido' ? `${config.tam} ${config.unid}` : 'o do formato', bind: false },
    { key: 'conteudo_real', label: 'Conteúdo real', value: item.condition === 'divergente' ? config.real : '', bind: false },
  ], conditionLabel(item.condition), '', true))
  return {
    cases,
    possible: selected.length,
    excluded: 0,
    generated: cases.length,
    detail: unknown
      ? `Parte do tamanho só fecha na geração. O teto do lote é ${fmtBytes(FILE_TOTAL_LIMIT)} e o de cada arquivo é ${fmtBytes(FILE_BYTE_LIMIT)}. Se passar, nada é entregue. O tamanho pedido vale só para Corrompido; os outros saem no tamanho do próprio formato.`
      : `Teto de ${fmtBytes(FILE_BYTE_LIMIT)} por arquivo e ${fmtBytes(FILE_TOTAL_LIMIT)} no lote. O tamanho pedido vale só para Corrompido; os outros saem no tamanho do próprio formato.`,
    errors: [],
  }
}

export function fileRequest(config: FileComboConfig, item: FileSelection): FileRequest {
  const base = FILE_DEF as FileRequest
  return {
    ...base,
    sel: [item.extension],
    nome: config.nome || 'arquivo_teste',
    nomeVar: 'Simples',
    vazio: item.condition === 'vazio',
    tam: config.tam,
    unid: config.unid,
    conteudo: contentOf(item.condition),
    real: config.real,
    qtd: 1,
    folderMode: 'raiz',
    folderName: 'arquivos_teste',
  }
}

export function fileRequests(config: FileComboConfig) {
  return config.selected
    .filter((item) => config.extensions.includes(item.extension))
    .map((item) => fileRequest(config, item))
}

function contentOf(condition: FileConditionId) {
  if (condition === 'corrompido') return 'Corrompido'
  if (condition === 'truncado') return 'Truncado'
  if (condition === 'divergente') return 'Extensão divergente'
  return 'Estrutura real'
}

function conditionLabel(condition: FileConditionId) {
  return FILE_CONDITIONS.find((item) => item.id === condition)?.label ?? condition
}

function estimateCombo(request: FileRequest, condition: FileConditionId) {
  if (condition === 'vazio') return 0
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
  const declared = request.tam * (multipliers[request.unid] ?? Number.NaN)
  if (condition === 'corrompido') return Number.isFinite(declared) ? declared : null
  const extension = condition === 'divergente' ? request.real : request.sel[0]
  const media = estimateMediaBytes(extension, request)
  if (media === null) return null
  return condition === 'truncado' ? Math.max(1, Math.floor(media * 0.6)) : media
}
