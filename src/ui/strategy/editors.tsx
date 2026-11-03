import { useState, type KeyboardEvent } from 'react'
import { CT } from '../../domain/mfEngine.ts'
import type { PlannedCase, StrategyPlan, ValueBinding } from '../../domain/strategy/types.ts'
import type { RulerModel } from '../../domain/strategy/partitions.ts'

export function nid() {
  return Math.random().toString(36).slice(2, 9)
}

export function ChipBox({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const next = draft.trim()
    if (!next || values.includes(next)) return
    onChange([...values, next])
    setDraft('')
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {values.map((value) => (
          <button key={value} type="button" aria-label={`Remover ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>
            {value} ×
          </button>
        ))}
      </div>
      <input
        value={draft}
        aria-label={`Novo valor de ${label}`}
        placeholder="Digite e pressione Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add()
          }
        }}
      />
    </div>
  )
}

export function NameList({
  label,
  items,
  onChange,
}: {
  label: string
  items: { id: string; name: string }[]
  onChange: (items: { id: string; name: string }[]) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="field name-list">
      <span>{label}</span>
      {items.map((item) => (
        <div key={item.id} className="inline-edit name-row">
          <input
            aria-label={`${label} ${item.name}`}
            value={item.name}
            onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))}
          />
          <button type="button" className="ghost" aria-label={`Remover ${item.name || label}`} onClick={() => onChange(items.filter((row) => row.id !== item.id))}>
            Remover
          </button>
        </div>
      ))}
      <input
        value={draft}
        placeholder="Nome e Enter"
        aria-label={`Adicionar ${label}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const name = draft.trim()
          if (!name) return
          onChange([...items, { id: nid(), name }])
          setDraft('')
        }}
      />
    </div>
  )
}

export function moveFocus(event: KeyboardEvent<HTMLElement>, row: number, col: number) {
  const delta = event.key === 'ArrowRight' ? [0, 1] : event.key === 'ArrowLeft' ? [0, -1] : event.key === 'ArrowDown' ? [1, 0] : event.key === 'ArrowUp' ? [-1, 0] : null
  if (!delta) return
  const next = document.getElementById(`mx-${row + delta[0]}-${col + delta[1]}`)
  if (!(next instanceof HTMLElement)) return
  event.preventDefault()
  next.focus()
}

export function RulerView({ ruler }: { ruler: RulerModel }) {
  const span = ruler.end - ruler.start || 1
  const left = ((ruler.validFrom - ruler.start) / span) * 100
  const width = ((ruler.validTo - ruler.validFrom) / span) * 100
  return (
    <div className="ruler">
      <div className="ruler-track" role="img" aria-label="Régua com a faixa válida e os pontos de teste">
        <span className="ruler-valid" style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }} />
        {ruler.marks.map((mark) => (
          <i key={`${mark.kind}-${mark.label}-${mark.at}`} className={`ruler-mark ${mark.kind}`} style={{ left: `${((mark.at - ruler.start) / span) * 100}%` }} title={mark.label} />
        ))}
      </div>
      <ul className="ruler-legend">
        {ruler.marks.map((mark) => (
          <li key={`${mark.kind}-${mark.label}-${mark.at}`}>{mark.label}</li>
        ))}
      </ul>
    </div>
  )
}

export function Totals({ plan, labels }: { plan: StrategyPlan; labels: [string, string, string] }) {
  return (
    <div className="stats">
      <span>{labels[0]}: {plan.possible}</span>
      <span>{labels[1]}: {plan.excluded}</span>
      <span>{labels[2]}: {plan.generated}</span>
    </div>
  )
}

export function Coverage({ plan }: { plan: StrategyPlan }) {
  if (!plan.coverage) return null
  const { covered, total, unit } = plan.coverage
  const width = total === 0 ? 0 : Math.round((covered / total) * 100)
  return (
    <div className="coverage">
      <div className="coverage-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
      <p>{unit === 'combinações' ? `${covered} de ${total} combinações permitidas cobertas.` : `${covered} de ${total} ${unit} permitidos cobertos.`}</p>
      <small>Esta conta vale só para a estratégia escolhida. Não é a cobertura total dos testes.</small>
    </div>
  )
}

export function CaseTable({ cases }: { cases: PlannedCase[] }) {
  if (!cases.length) return <p className="muted">Nenhum caso para esta configuração.</p>
  const columns: { key: string; label: string }[] = []
  for (const item of cases) {
    for (const input of item.inputs) {
      if (!columns.some((column) => column.key === input.key)) columns.push({ key: input.key, label: input.label })
    }
  }
  return (
    <div className="sheet-wrap">
      <table className="sheet strategy-sheet case-sheet">
        <thead>
          <tr>
            <th>Caso</th>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            <th className="col-text">Regra aplicada</th>
            <th className="col-text">Resultado esperado</th>
            <th className="col-text">Concreto</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              {columns.map((column) => <td key={column.key}>{item.inputs.find((input) => input.key === column.key)?.value ?? ''}</td>)}
              <td className="col-text">{item.rule}</td>
              <td className="col-text">{item.expected}</td>
              <td className="col-text">{item.concrete === 'gerado' ? 'Gerado' : item.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BindingEditor({
  targets,
  bindings,
  onChange,
}: {
  targets: { ownerId: string; label: string; value: string }[]
  bindings: ValueBinding[]
  onChange: (bindings: ValueBinding[]) => void
}) {
  if (!targets.length) return null
  const generators = CT as string[]
  function update(ownerId: string, value: string, patch: Partial<ValueBinding>) {
    const current = bindings.find((binding) => binding.ownerId === ownerId && binding.value === value)
    const next = { ownerId, value, field: '', generator: '', rule: 'Válido' as const, ...current, ...patch }
    onChange([...bindings.filter((binding) => binding.ownerId !== ownerId || binding.value !== value), next])
  }
  return (
    <div className="stack">
      <h3>Vínculo com campo</h3>
      <p className="muted">Sem gerador, o caso continua exportável e a massa concreta fica pendente.</p>
      <div className="sheet-wrap">
        <table className="sheet strategy-sheet">
          <thead>
            <tr>
              <th>Entrada</th>
              <th>Valor planejado</th>
              <th>Campo</th>
              <th>Gerador</th>
              <th>Regra</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => {
              const binding = bindings.find((item) => item.ownerId === target.ownerId && item.value === target.value)
              return (
                <tr key={`${target.ownerId}|${target.value}`}>
                  <td>{target.label}</td>
                  <td>{target.value}</td>
                  <td>
                    <input
                      aria-label={`Campo de ${target.label} ${target.value}`}
                      value={binding?.field ?? ''}
                      onChange={(event) => update(target.ownerId, target.value, { field: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Gerador de ${target.label} ${target.value}`}
                      value={binding?.generator ?? ''}
                      onChange={(event) => update(target.ownerId, target.value, { generator: event.target.value })}
                    >
                      <option value="">Sem gerador</option>
                      {generators.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Regra de ${target.label} ${target.value}`}
                      value={binding?.rule ?? 'Válido'}
                      onChange={(event) => update(target.ownerId, target.value, { rule: event.target.value === 'Inválido' ? 'Inválido' : 'Válido' })}
                    >
                      <option>Válido</option>
                      <option>Inválido</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VariationDiff({ cases }: { cases: PlannedCase[] }) {
  if (!cases.length) return null
  return (
    <div className="diff-list">
      {cases.map((item) => {
        const baseText = item.inputs.find((input) => input.key === 'base')?.value ?? '{}'
        const nextText = item.inputs.find((input) => input.key === 'variacao')?.value ?? '{}'
        const base = JSON.parse(baseText) as Record<string, unknown>
        const next = JSON.parse(nextText) as Record<string, unknown>
        const keys = [...new Set([...Object.keys(base), ...Object.keys(next)])]
        return (
          <div key={item.id}>
            <strong>{item.id}</strong>
            <p className="muted">{item.rule}</p>
            <div className="sheet-wrap">
              <table className="sheet strategy-sheet">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Base</th>
                    <th>Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const left = key in base ? JSON.stringify(base[key]) : '(ausente)'
                    const right = key in next ? JSON.stringify(next[key]) : '(ausente)'
                    return (
                      <tr key={key} className={left === right ? undefined : 'diff-row'}>
                        <td>{key}</td>
                        <td>{left}</td>
                        <td>{right}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
