import type { PlannedCase } from './types.ts'

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export function strategyRows(cases: PlannedCase[]) {
  const keys: { key: string; label: string }[] = []
  for (const item of cases) {
    for (const input of item.inputs) {
      if (!keys.some((column) => column.key === input.key)) keys.push({ key: input.key, label: input.label })
    }
  }
  return cases.map((item) => {
    const row: Record<string, string> = { caso: item.id }
    for (const column of keys) row[column.key] = item.inputs.find((input) => input.key === column.key)?.value ?? ''
    row.regra_aplicada = item.rule
    row.resultado_esperado = item.expected
    row.concreto = item.concrete === 'gerado' ? 'gerado' : 'nao_configurado'
    row.observacao = item.note
    return row
  })
}

export function strategyToJson(cases: PlannedCase[]) {
  return JSON.stringify(strategyRows(cases), null, 2)
}

export function strategyToCsv(cases: PlannedCase[]) {
  const rows = strategyRows(cases)
  const keys = rows[0] ? Object.keys(rows[0]) : ['caso', 'regra_aplicada', 'resultado_esperado', 'concreto', 'observacao']
  const lines = [keys.map(escapeCsv).join(',')]
  for (const row of rows) lines.push(keys.map((key) => escapeCsv(row[key] ?? '')).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}
