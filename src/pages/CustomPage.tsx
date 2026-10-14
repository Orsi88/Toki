import { useState } from 'react'
import { COLUMN_TYPES, customToCsv, customToJson, defaultExtra, generateCustom, productColumns, validateCustom, type ColumnExtra, type ColumnRule, type CustomColumn, type CustomRow } from '../domain/custom.ts'
import { isMeasure, parseColor, unitsFor } from '../domain/values.ts'
import { copyText, downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { CopyButton } from '../ui/CopyButton.tsx'
import { Switch } from '../ui/Fields.tsx'
import { ClearButton } from '../ui/ClearButton.tsx'
import { VaryButton } from '../ui/VaryButton.tsx'

const RULES: ColumnRule[] = ['Válido', 'Inválido', 'Misto']

function ColumnExtraFields({ column, onChange }: { column: CustomColumn; onChange: (extra: ColumnExtra) => void }) {
  const extra = column.extra ?? {}
  const set = (patch: ColumnExtra) => onChange({ ...extra, ...patch })
  if (column.type === 'SKU') {
    return (
      <label className="field">
        <span>Comprimento do SKU</span>
        <input type="number" aria-label="Comprimento do SKU" value={extra.skuLen ?? ''} onChange={(event) => set({ skuLen: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
      </label>
    )
  }
  if (column.type === 'Descrição') {
    return (
      <label className="field">
        <span>Tamanho da descrição</span>
        <select aria-label="Tamanho da descrição" value={extra.descSize ?? 'Média'} onChange={(event) => set({ descSize: event.target.value })}>
          {['Curta', 'Média', 'Extensa'].map((size) => <option key={size}>{size}</option>)}
        </select>
      </label>
    )
  }
  if (column.type === 'Cor') {
    return (
      <>
        <label className="field">
          <span>Formato da cor</span>
          <select aria-label="Formato da cor" value={extra.colorFormat ?? 'HEX'} onChange={(event) => set({ colorFormat: event.target.value })}>
            {['HEX', 'RGB', 'RGBA'].map((format) => <option key={format}>{format}</option>)}
          </select>
        </label>
        {extra.colorFormat === 'RGBA' ? (
          <label className="field">
            <span>Alfa (0 a 100)</span>
            <input type="number" aria-label="Alfa" value={extra.alpha ?? 100} onChange={(event) => set({ alpha: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
          </label>
        ) : null}
      </>
    )
  }
  if (!isMeasure(column.type)) return null
  const units = unitsFor(column.type)
  return (
    <>
      <label className="field">
        <span>Unidade</span>
        <select aria-label="Unidade" value={extra.unit ?? units[0]} onChange={(event) => set({ unit: event.target.value })}>
          {units.map((unit) => <option key={unit}>{unit}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Mínimo</span>
        <input type="number" aria-label="Mínimo" value={extra.min ?? ''} onChange={(event) => set({ min: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
      </label>
      <label className="field">
        <span>Máximo</span>
        <input type="number" aria-label="Máximo" value={extra.max ?? ''} onChange={(event) => set({ max: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
      </label>
    </>
  )
}

function todayInput() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function CustomPage({ onToast }: { onToast: (message: string | Notice, bad?: boolean) => void }) {
  const [columns, setColumns] = useState<CustomColumn[]>([
    { id: 'c1', name: 'nome', type: 'Nome completo', rule: 'Válido' },
    { id: 'c2', name: 'cpf', type: 'CPF', rule: 'Válido' },
    { id: 'c3', name: 'email', type: 'E-mail', rule: 'Válido' },
  ])
  const [count, setCount] = useState(10)
  const [consistent, setConsistent] = useState(true)
  const [reference, setReference] = useState(todayInput)
  const [records, setRecords] = useState<CustomRow[] | null>(null)
  const error = validateCustom(columns, count)

  function roll() {
    if (error) return
    setRecords(generateCustom({
      columns,
      count,
      seed: Math.floor(Math.random() * 1_000_000_000),
      referenceDate: new Date(`${reference}T12:00:00`),
      consistent,
    }))
  }

  function generate() {
    roll()
    if (!error) onToast({ title: 'Lote pronto', detail: 'CSV e JSON usam estes mesmos valores.' })
  }

  function reset() {
    setColumns([
      { id: 'c1', name: 'nome', type: 'Nome completo', rule: 'Válido' },
      { id: 'c2', name: 'cpf', type: 'CPF', rule: 'Válido' },
      { id: 'c3', name: 'email', type: 'E-mail', rule: 'Válido' },
    ])
    setCount(10)
    setConsistent(true)
    setReference(todayInput())
    setRecords(null)
    onToast('Configurações e prévia limpas.')
  }

  const preview = records?.slice(0, 10) ?? []

  return (
    <div className="work">
      <ClearButton onClick={reset} />
      <section className="step">
        <header className="step-title">
          <b>1</b>
          <div>
            <h2>Defina as colunas</h2>
            <p>Nome, tipo e regra de cada coluna do lote.</p>
          </div>
        </header>
        <div className="column-list">
          {columns.map((column, index) => (
            <article key={column.id} className="card column-card">
              <header className="column-head">
                <div className="step-title">
                  <b>{index + 1}</b>
                  <h3>Coluna</h3>
                </div>
                <div className="column-actions">
                  <button type="button" className="ghost" disabled={index === 0} onClick={() => setColumns((list) => {
                    if (index === 0) return list
                    const copy = [...list]
                    const [item] = copy.splice(index, 1)
                    copy.splice(index - 1, 0, item)
                    return copy
                  })}>Subir</button>
                  <button type="button" className="ghost" disabled={index === columns.length - 1} onClick={() => setColumns((list) => {
                    if (index === list.length - 1) return list
                    const copy = [...list]
                    const [item] = copy.splice(index, 1)
                    copy.splice(index + 1, 0, item)
                    return copy
                  })}>Descer</button>
                  <button type="button" className="ghost" onClick={() => setColumns((list) => list.filter((item) => item.id !== column.id))}>Remover</button>
                </div>
              </header>
              <div className="fields">
                <label className="field">
                  <span>Nome</span>
                  <input value={column.name} aria-label="Nome da coluna" onChange={(event) => setColumns((list) => list.map((item) => item.id === column.id ? { ...item, name: event.target.value } : item))} />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select value={column.type} aria-label="Tipo" onChange={(event) => setColumns((list) => list.map((item) => item.id === column.id ? { ...item, type: event.target.value, extra: defaultExtra(event.target.value) } : item))}>
                    {COLUMN_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Regra</span>
                  <select value={column.rule} aria-label="Regra" onChange={(event) => setColumns((list) => list.map((item) => item.id === column.id ? { ...item, rule: event.target.value as ColumnRule } : item))}>
                    {RULES.map((rule) => <option key={rule}>{rule}</option>)}
                  </select>
                </label>
                <ColumnExtraFields column={column} onChange={(extra) => setColumns((list) => list.map((item) => item.id === column.id ? { ...item, extra } : item))} />
              </div>
            </article>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => setColumns((list) => [...list, { id: `c${Date.now()}`, name: `coluna_${list.length + 1}`, type: 'Texto curto', rule: 'Válido' }])}>Adicionar coluna</button>
        <button type="button" className="ghost" onClick={() => { setColumns(productColumns()); setRecords(null) }}>Usar preset Produtos</button>
      </section>
      <section className="step">
        <header className="step-title">
          <b>2</b>
          <div>
            <h2>Defina a geração do lote</h2>
            <p>Quantidade, data de referência e se os dados da mesma linha saem da mesma pessoa.</p>
          </div>
        </header>
        <div className="fields">
          <label className="field">
            <span>Quantidade</span>
            <input type="number" value={count} onChange={(event) => setCount(event.target.value === '' ? Number.NaN : Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Data de referência</span>
            <input type="date" value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
          <label className="field">
            <Switch checked={consistent} label="Consistência" onChange={setConsistent} />
          </label>
        </div>
        <p className="muted">Misto sorteia cerca de metade das células como inválidas. Com consistência, nome, endereço, CPF e, quando os dois existem, idade e nascimento saem da mesma pessoa.</p>
        {error ? <p className="banner bad">{error}</p> : null}
        <button id="mf-generate" className="primary" type="button" disabled={Boolean(error)} onClick={generate}>Gerar lote</button>
      </section>
      <section className="panel" id="resultado">
        <header className="preview-head">
          <h2>Prévia</h2>
          <VaryButton disabled={Boolean(error)} onClick={roll} />
        </header>
        {!records ? <p className="muted">Gere o lote para ver as 10 primeiras linhas e exportar todas.</p> : <p className="muted">Mostrando {preview.length} de {records.length}.</p>}
        {records && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => <th key={column.id}>{column.name}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={index}>
                      {columns.map((column) => {
                        const value = row.values[column.name] ?? ''
                        return (
                          <td key={column.id}>
                            <span className="cell">
                              <button type="button" className="cell-hit" title="Clique para copiar" onClick={() => copyText(value).then((ok) => onToast(ok ? 'Copiado.' : 'Não foi possível copiar.', !ok))}>
                                {parseColor(value) ? <i className="swatch" style={{ background: value }} /> : null}
                                {value || '(vazio)'}
                              </button>
                              {row.checks[column.name] === 'falha' ? <span className="tone bad">falha</span> : null}
                              <CopyButton label={`Copiar ${column.name}`} onCopy={async () => { const ok = await copyText(value); onToast(ok ? 'Copiado.' : 'Não foi possível copiar.', !ok) }} />
                            </span>
                          </td>
                        )
                      })}
                      <td>
                        <CopyButton
                          label={`Copiar linha ${index + 1}`}
                          onCopy={async () => {
                            const ok = await copyText(columns.map((column) => row.values[column.name] ?? '').join('\t'))
                            onToast(ok ? 'Linha copiada.' : 'Não foi possível copiar.', !ok)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-actions">
              <button type="button" onClick={async () => {
                const ok = await copyText(customToCsv(columns, records).replace(/^\uFEFF/, ''))
                onToast(ok ? 'CSV copiado.' : 'Não foi possível copiar.', !ok)
              }}>Copiar CSV</button>
              <button type="button" onClick={() => { downloadText('massa.csv', customToCsv(columns, records), 'text/csv;charset=utf-8'); onToast(downloadNotice()) }}>Baixar CSV</button>
              <button type="button" onClick={() => { downloadText('massa.json', customToJson(columns, records), 'application/json'); onToast(downloadNotice()) }}>Baixar JSON</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
