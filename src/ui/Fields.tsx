import { useEffect, useId, useState, type FormEvent } from 'react'
import { key } from '../domain/mfEngine.ts'
import { optionIcon } from './optionIcon.ts'
import { TypePicker } from './TypePicker.tsx'

export type EngineField = {
  k: string
  label: string | ((config: Record<string, unknown>) => string)
  type: 'seg' | 'sel' | 'num' | 'tog' | 'txt' | 'chips'
  opts?: string[] | ((config: Record<string, unknown>) => string[])
  show?: (config: Record<string, unknown>) => boolean
  help?: string | ((config: Record<string, unknown>) => string)
  presets?: number[]
  sample?: string
  custom?: boolean
  // Mostra a escolha como cartões com ícone; a lista diz quais ficam à mostra quando há mais de 4 opções.
  cards?: string[]
}

export function fieldVisible(field: EngineField, config: Record<string, unknown>) {
  return !field.show || field.show(config)
}

export function fieldOptions(field: EngineField, config: Record<string, unknown>) {
  if (!field.opts) return []
  return typeof field.opts === 'function' ? field.opts(config) : field.opts
}

function fieldLabel(field: EngineField, config: Record<string, unknown>) {
  return typeof field.label === 'function' ? field.label(config) : field.label
}

export function Tip({ text }: { text: string }) {
  return (
    <button type="button" className="tip-dot" aria-label={text} onClick={(event) => event.preventDefault()}>
      <span aria-hidden="true">i</span>
      <span className="tip" role="tooltip">{text}</span>
    </button>
  )
}

export function Switch({
  checked,
  label,
  help,
  onChange,
}: {
  checked: boolean
  label: string
  help?: string
  onChange: (checked: boolean) => void
}) {
  return (
    <span className="switch-row">
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <span className="switch-label">{label}</span>
      {help ? <Tip text={help} /> : null}
    </span>
  )
}

function fieldHelp(field: EngineField, config: Record<string, unknown>) {
  if (!field.help) return ''
  return typeof field.help === 'function' ? field.help(config) : field.help
}

function extraNames(config: Record<string, unknown>, keyName: string) {
  const extras = config[`${keyName}Extras`]
  if (!Array.isArray(extras)) return []
  return extras.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('name' in item)) return []
    const name = String((item as { name: unknown }).name || '').trim()
    return name ? [name] : []
  })
}

function ChipField({
  field,
  config,
  onChange,
  inputId,
}: {
  field: EngineField
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  inputId: string
}) {
  const options = fieldOptions(field, config)
  const selected = Array.isArray(config[field.k]) ? config[field.k] as string[] : []
  const extrasKey = `${field.k}Extras`
  const extras = Array.isArray(config[extrasKey]) ? config[extrasKey] as { name: string; type: string }[] : []
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState(options.includes('Texto curto') ? 'Texto curto' : options[0] ?? '')
  const [hint, setHint] = useState('')

  function toggle(option: string) {
    const current = Array.isArray(config[field.k]) ? [...(config[field.k] as string[])] : []
    const on = current.includes(option)
    onChange(field.k, on ? current.filter((item) => item !== option) : [...current, option])
  }

  function addCustom(event: FormEvent) {
    event.preventDefault()
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name) {
      setHint('Escreva o nome que o sistema usa.')
      return
    }
    const known = options.find((option) => option.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    if (known) {
      if (!selected.includes(known)) toggle(known)
      setDraft('')
      setHint('')
      return
    }
    if (extras.some((item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      setHint('Esse nome já está na lista.')
      return
    }
    const slug = key(name)
    const taken = new Set<string>()
    for (const label of selected) {
      if (!extras.some((item) => item.name === label)) taken.add(label === 'ID' ? 'id' : key(label))
    }
    for (const item of extras) taken.add(key(item.name))
    if (!slug || taken.has(slug)) {
      setHint('Esse nome repete a chave de um campo que já está marcado.')
      return
    }
    onChange(extrasKey, [...extras, { name, type: kind || options[0] || 'Texto curto' }])
    onChange(field.k, [...selected, name])
    setDraft('')
    setHint('')
  }

  function removeCustom(name: string) {
    onChange(extrasKey, extras.filter((item) => item.name !== name))
    onChange(field.k, selected.filter((item) => item !== name))
  }

  return (
    <>
      <div className="chips">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => toggle(option)}>
            {option}
          </button>
        ))}
        {field.custom ? extras.map((item) => (
          <span key={item.name} className={`chip-own ${selected.includes(item.name) ? 'on' : ''}`}>
            <button type="button" aria-pressed={selected.includes(item.name)} onClick={() => toggle(item.name)}>
              {item.name}
              <em>{item.type}</em>
            </button>
            <button type="button" className="chip-x" aria-label={`Remover ${item.name}`} onClick={() => removeCustom(item.name)}>×</button>
          </span>
        )) : null}
      </div>
      {field.custom ? (
        <form className="chip-add" onSubmit={addCustom}>
          <input
            id={inputId}
            value={draft}
            placeholder="Nome no seu sistema"
            aria-label="Nome no seu sistema"
            onChange={(event) => { setDraft(event.target.value); setHint('') }}
          />
          <select aria-label="Tipo do valor" value={kind} onChange={(event) => setKind(event.target.value)}>
            {options.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button type="submit" className="ghost">Adicionar</button>
          {hint ? <p className="chip-hint">{hint}</p> : null}
        </form>
      ) : null}
    </>
  )
}

export function FieldList({
  fields,
  config,
  onChange,
}: {
  fields: EngineField[]
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  useEffect(() => {
    for (const field of fields) {
      if (!fieldVisible(field, config)) continue
      if (field.type === 'chips') {
        const options = fieldOptions(field, config)
        const selected = Array.isArray(config[field.k]) ? config[field.k] as string[] : []
        const extras = field.custom ? extraNames(config, field.k) : []
        const allowed = new Set([...options, ...extras])
        const kept = selected.filter((item) => allowed.has(item))
        if (kept.length !== selected.length) onChange(field.k, kept)
        continue
      }
      if (field.type !== 'sel' && field.type !== 'seg') continue
      const options = fieldOptions(field, config)
      if (options.length && !options.includes(String(config[field.k]))) onChange(field.k, options[0])
    }
  }, [config, fields, onChange])

  const uid = useId()
  const visible = fields.filter((field) => fieldVisible(field, config))
  const presetsWithToggle = visible.length === 4
    && Boolean(visible[0]?.presets?.length)
    && visible[2]?.type === 'tog'
    && visible[3]?.type === 'tog'

  function renderFace(field: EngineField) {
    const help = fieldHelp(field, config)
    const label = fieldLabel(field, config)
    const checked = Boolean(config[field.k])
    const sample = field.sample || ''
    return (
      <div className={`face ${checked ? 'on' : ''}`} key={field.k}>
        <button type="button" className="face-hit" aria-pressed={checked} onClick={() => onChange(field.k, !checked)}>
          <span className={`face-sample ${sample.includes('\n') ? 'stacked' : ''}`} aria-hidden="true">{sample}</span>
          <span className="face-name">{label}</span>
        </button>
        {help ? <Tip text={help} /> : null}
      </div>
    )
  }

  function renderField(field: EngineField) {
    const help = fieldHelp(field, config)
    const label = fieldLabel(field, config)
    const id = `${uid}-${field.k}`
    if (field.cards && (field.type === 'seg' || field.type === 'sel')) {
      return (
        <div className="field field-cards" key={field.k}>
          <span className="field-name">{label}</span>
          {help ? <Tip text={help} /> : null}
          <TypePicker
            label={label}
            main={field.cards}
            value={String(config[field.k] ?? '')}
            options={fieldOptions(field, config).map((option) => ({ value: option, label: option, icon: optionIcon(option) }))}
            onChange={(value) => onChange(field.k, value)}
          />
        </div>
      )
    }
    return (
      <div className="field" key={field.k}>
        {field.type === 'tog' ? <span aria-hidden="true">&nbsp;</span> : <label className="field-name" htmlFor={id}>{label}</label>}
        {help && field.type !== 'tog' ? <Tip text={help} /> : null}
        {(field.type === 'seg' || field.type === 'sel') && (
          <select id={id} value={String(config[field.k] ?? '')} onChange={(event) => onChange(field.k, event.target.value)}>
            {fieldOptions(field, config).map((option) => <option key={option}>{option}</option>)}
          </select>
        )}
            {field.type === 'num' && (
              <input
                id={id}
                type="number"
            value={config[field.k] === '' || config[field.k] === undefined ? '' : String(config[field.k])}
            onChange={(event) => onChange(field.k, event.target.value === '' ? '' : Number(event.target.value))}
          />
        )}
            {field.type === 'txt' && (
              <input
                id={id}
                type="text"
            value={String(config[field.k] ?? '')}
            onChange={(event) => onChange(field.k, event.target.value)}
          />
        )}
        {field.type === 'tog' && (
          <Switch
            checked={Boolean(config[field.k])}
            label={label}
            help={help}
            onChange={(checked) => onChange(field.k, checked)}
          />
        )}
        {field.type === 'chips' && (
          <ChipField field={field} config={config} onChange={onChange} inputId={id} />
        )}
        {field.presets && field.type === 'num' ? (
          <div className="presets">
            {field.presets.map((preset) => (
              <button key={preset} type="button" onClick={() => onChange(field.k, preset)}>{preset}</button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (presetsWithToggle) {
    return (
      <div className="fields fields-presets">
        {renderField(visible[0])}
        {renderField(visible[1])}
        <div className="toggle-stack">
          {renderField(visible[2])}
          {renderField(visible[3])}
        </div>
      </div>
    )
  }

  const groups: { kind: 'faces' | 'fields'; items: EngineField[] }[] = []
  for (const field of visible) {
    const kind = field.type === 'tog' && field.sample ? 'faces' : 'fields'
    const last = groups[groups.length - 1]
    if (last?.kind === kind) last.items.push(field)
    else groups.push({ kind, items: [field] })
  }

  return (
    <div className="field-groups">
      {groups.map((group, index) => group.kind === 'faces'
        ? <div className="face-grid" key={index}>{group.items.map((field) => renderFace(field))}</div>
        : <div className="fields" key={index}>{group.items.map((field) => renderField(field))}</div>)}
    </div>
  )
}
