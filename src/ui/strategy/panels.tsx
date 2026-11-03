import { FAM } from '../../domain/mfEngine.ts'
import { decisionCombinations, mergeDecisionRules, type DecisionCondition, type DecisionConfig } from '../../domain/strategy/decision.ts'
import { FILE_CONDITIONS, type FileComboConfig, type FileConditionId } from '../../domain/strategy/files.ts'
import type { ComboConfig } from '../../domain/strategy/combinations.ts'
import type { PartitionClass, PartitionConfig } from '../../domain/strategy/partitions.ts'
import { cellKey, type PermissionConfig, type PermissionMark } from '../../domain/strategy/permissions.ts'
import type { StateConfig } from '../../domain/strategy/states.ts'
import type { VariationConfig, VariationKind } from '../../domain/strategy/variations.ts'
import { Switch } from '../Fields.tsx'
import { ChipBox, moveFocus, NameList, nid, RulerView } from './editors.tsx'
import type { RulerModel } from '../../domain/strategy/partitions.ts'

const CHANGES: { id: VariationKind; label: string }[] = [
  { id: 'ausente', label: 'Campo ausente' },
  { id: 'null', label: 'Nulo' },
  { id: 'vazio', label: 'Vazio' },
  { id: 'espacos', label: 'Só espaços' },
  { id: 'limite', label: 'Limite excedido' },
  { id: 'duplicidade', label: 'Duplicidade' },
]

export function PartitionPanel({
  config,
  ruler,
  onChange,
}: {
  config: PartitionConfig
  ruler: RulerModel | null
  onChange: (config: PartitionConfig) => void
}) {
  return (
    <div className="stack">
      <div className="fields">
        <label className="field">
          <span>Tipo de dado</span>
          <select value={config.type} onChange={(event) => onChange({ ...config, type: event.target.value as PartitionConfig['type'] })}>
            <option value="numero">Número</option>
            <option value="texto">Texto</option>
            <option value="data">Data</option>
          </select>
        </label>
        <label className="field">
          <span>Mínimo</span>
          <input aria-label="Mínimo" value={config.min} onChange={(event) => onChange({ ...config, min: event.target.value })} />
        </label>
        <label className="field">
          <span>Máximo</span>
          <input aria-label="Máximo" value={config.max} onChange={(event) => onChange({ ...config, max: event.target.value })} />
        </label>
        <label className="field">
          <span>Passo</span>
          <input aria-label="Passo" value={config.step} onChange={(event) => onChange({ ...config, step: event.target.value })} />
        </label>
        <div className="strategy-checks">
          <Switch checked={config.includeMin} label="Incluir mínimo" onChange={(includeMin) => onChange({ ...config, includeMin })} />
          <Switch checked={config.includeMax} label="Incluir máximo" onChange={(includeMax) => onChange({ ...config, includeMax })} />
        </div>
      </div>
      <details className="adv-box">
        <summary>Classes extras</summary>
        <ClassList label="Válidas" items={config.validClasses} onChange={(validClasses) => onChange({ ...config, validClasses })} />
        <ClassList label="Inválidas" items={config.invalidClasses} onChange={(invalidClasses) => onChange({ ...config, invalidClasses })} />
      </details>
      {ruler ? <RulerView ruler={ruler} /> : null}
    </div>
  )
}

function ClassList({ label, items, onChange }: { label: string; items: PartitionClass[]; onChange: (items: PartitionClass[]) => void }) {
  return (
    <div className="stack">
      <h3>{label}</h3>
      {items.map((item) => (
        <div key={item.id} className="inline-edit group-row">
          <input aria-label={`Nome da classe em ${label}`} value={item.name} placeholder="Nome" onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} />
          <input aria-label={`Início de ${item.name || label}`} value={item.from} placeholder="De" onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, from: event.target.value } : row))} />
          <input aria-label={`Fim de ${item.name || label}`} value={item.to} placeholder="Até" onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, to: event.target.value } : row))} />
          <button type="button" className="ghost" onClick={() => onChange(items.filter((row) => row.id !== item.id))}>Remover</button>
        </div>
      ))}
      <button type="button" className="ghost add-soft" onClick={() => onChange([...items, { id: nid(), name: '', from: '', to: '' }])}>Adicionar classe</button>
    </div>
  )
}

export function DecisionPanel({ config, onChange }: { config: DecisionConfig; onChange: (config: DecisionConfig) => void }) {
  function changeConditions(conditions: DecisionCondition[]) {
    const built = decisionCombinations(conditions)
    onChange(built.error ? { ...config, conditions } : { ...config, conditions, rules: mergeDecisionRules(config.rules, conditions, built.rows) })
  }
  return (
    <div className="stack">
      {config.conditions.map((condition) => (
        <div key={condition.id} className="group-block">
          <div className="inline-edit">
            <input aria-label="Nome da condição" value={condition.name} onChange={(event) => changeConditions(config.conditions.map((item) => item.id === condition.id ? { ...item, name: event.target.value } : item))} />
            <button type="button" className="ghost" onClick={() => changeConditions(config.conditions.filter((item) => item.id !== condition.id))}>Remover</button>
          </div>
          <ChipBox label="Valores" values={condition.values} onChange={(values) => changeConditions(config.conditions.map((item) => item.id === condition.id ? { ...item, values } : item))} />
        </div>
      ))}
      <button type="button" className="ghost add-soft" onClick={() => changeConditions([...config.conditions, { id: nid(), name: 'Condição', values: ['Sim', 'Não'] }])}>Adicionar condição</button>
      {config.rules.length ? (
        <div className="sheet-wrap">
          <table className="sheet strategy-sheet">
            <thead>
              <tr>
                {config.conditions.map((condition) => <th key={condition.id} className="combo-cell">{condition.name || 'Condição'}</th>)}
                {config.actions.map((action) => <th key={action.id}>{action.name || 'Resultado'}</th>)}
                <th className="pin-end">Ignorar</th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map((rule, row) => (
                <tr key={rule.id} className={rule.excluded ? 'is-ignored' : undefined}>
                  {config.conditions.map((condition) => (
                    <td key={condition.id} className="combo-cell">{rule.cells[condition.id] === '*' ? 'Indiferente' : rule.cells[condition.id]}</td>
                  ))}
                  {config.actions.map((action, actionIndex) => (
                    <td key={action.id}>
                      <input
                        id={`mx-${row}-${config.conditions.length + actionIndex}`}
                        className={(rule.actions[action.id] ?? '').trim() ? undefined : 'is-empty'}
                        aria-label={`${action.name || 'Resultado'}, linha ${row + 1}`}
                        placeholder="Não preenchido"
                        value={rule.actions[action.id] ?? ''}
                        onChange={(event) => onChange({ ...config, rules: config.rules.map((item) => item.id === rule.id ? { ...item, actions: { ...item.actions, [action.id]: event.target.value } } : item) })}
                        onKeyDown={(event) => moveFocus(event, row, config.conditions.length + actionIndex)}
                      />
                    </td>
                  ))}
                  <td className="pin-end">
                    <input
                      id={`mx-${row}-${config.conditions.length + config.actions.length}`}
                      type="checkbox"
                      aria-label={`Ignorar linha ${row + 1}`}
                      checked={rule.excluded}
                      onChange={(event) => onChange({ ...config, rules: config.rules.map((item) => item.id === rule.id ? { ...item, excluded: event.target.checked } : item) })}
                      onKeyDown={(event) => moveFocus(event, row, config.conditions.length + config.actions.length)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export function ComboPanel({ config, onChange }: { config: ComboConfig; onChange: (config: ComboConfig) => void }) {
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Cobertura">
        {([['todas', 'Todas'], ['pares', 'Pares'], ['trios', 'Trios']] as const).map(([mode, label]) => (
          <button key={mode} type="button" aria-pressed={config.mode === mode} onClick={() => onChange({ ...config, mode })}>{label}</button>
        ))}
      </div>
      {config.parameters.map((parameter) => (
        <div key={parameter.id} className="group-block">
          <div className="inline-edit">
            <input aria-label="Nome do parâmetro" value={parameter.name} onChange={(event) => onChange({ ...config, parameters: config.parameters.map((item) => item.id === parameter.id ? { ...item, name: event.target.value } : item) })} />
            <button type="button" className="ghost" onClick={() => onChange({ ...config, parameters: config.parameters.filter((item) => item.id !== parameter.id), constraints: config.constraints.filter((item) => item.leftId !== parameter.id && item.rightId !== parameter.id) })}>Remover parâmetro</button>
          </div>
          <ChipBox label={`Valores de ${parameter.name || 'parâmetro'}`} values={parameter.values} onChange={(values) => onChange({ ...config, parameters: config.parameters.map((item) => item.id === parameter.id ? { ...item, values } : item) })} />
        </div>
      ))}
      <button type="button" className="ghost add-soft" onClick={() => onChange({ ...config, parameters: [...config.parameters, { id: nid(), name: 'Parâmetro', values: ['1', '2'] }] })}>Adicionar parâmetro</button>
      <div className="group-block">
      <h3>Restrições</h3>
      <p className="muted">Um par marcado aqui não pode aparecer junto. O resto continua permitido.</p>
      {config.constraints.map((constraint) => (
        <div key={constraint.id} className="inline-edit group-row">
          <ParamValue
            parameters={config.parameters}
            paramId={constraint.leftId}
            value={constraint.leftValue}
            onParam={(leftId) => onChange({ ...config, constraints: config.constraints.map((item) => item.id === constraint.id ? { ...item, leftId, leftValue: config.parameters.find((parameter) => parameter.id === leftId)?.values[0] ?? '' } : item) })}
            onValue={(leftValue) => onChange({ ...config, constraints: config.constraints.map((item) => item.id === constraint.id ? { ...item, leftValue } : item) })}
          />
          <ParamValue
            parameters={config.parameters}
            paramId={constraint.rightId}
            value={constraint.rightValue}
            onParam={(rightId) => onChange({ ...config, constraints: config.constraints.map((item) => item.id === constraint.id ? { ...item, rightId, rightValue: config.parameters.find((parameter) => parameter.id === rightId)?.values[0] ?? '' } : item) })}
            onValue={(rightValue) => onChange({ ...config, constraints: config.constraints.map((item) => item.id === constraint.id ? { ...item, rightValue } : item) })}
          />
          <button type="button" className="ghost" onClick={() => onChange({ ...config, constraints: config.constraints.filter((item) => item.id !== constraint.id) })}>Remover</button>
        </div>
      ))}
      <button
        type="button"
        className="ghost add-soft"
        onClick={() => onChange({
          ...config,
          constraints: [...config.constraints, {
            id: nid(),
            leftId: config.parameters[0]?.id ?? '',
            leftValue: config.parameters[0]?.values[0] ?? '',
            rightId: config.parameters[1]?.id ?? config.parameters[0]?.id ?? '',
            rightValue: config.parameters[1]?.values[0] ?? '',
          }],
        })}
      >
        Adicionar restrição
      </button>
      </div>
    </div>
  )
}

function ParamValue({
  parameters,
  paramId,
  value,
  onParam,
  onValue,
}: {
  parameters: ComboConfig['parameters']
  paramId: string
  value: string
  onParam: (id: string) => void
  onValue: (value: string) => void
}) {
  const parameter = parameters.find((item) => item.id === paramId)
  return (
    <>
      <select aria-label="Parâmetro da restrição" value={paramId} onChange={(event) => onParam(event.target.value)}>
        {parameters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select aria-label="Valor da restrição" value={value} onChange={(event) => onValue(event.target.value)}>
        {(parameter?.values ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </>
  )
}

export function StatePanel({ config, onChange }: { config: StateConfig; onChange: (config: StateConfig) => void }) {
  const blank = { id: nid(), fromId: config.initialId, eventId: config.events[0]?.id ?? '', toId: config.states[0]?.id ?? '', expected: '' }
  return (
    <div className="stack">
      <div className="group-block">
        <p className="muted">As situações do caminho. Escolha em qual ele começa.</p>
        <NameList label="Estados" items={config.states} onChange={(states) => onChange({ ...config, states, initialId: states.some((state) => state.id === config.initialId) ? config.initialId : states[0]?.id ?? '' })} />
        <label className="field">
          <span>Começa em</span>
          <select value={config.initialId} onChange={(event) => onChange({ ...config, initialId: event.target.value })}>
            {config.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
      </div>
      <div className="group-block">
        <p className="muted">O que pode acontecer entre uma situação e outra. Exemplo: fechar, pagar, cancelar.</p>
        <NameList label="Ações" items={config.events} onChange={(events) => onChange({ ...config, events })} />
      </div>
      <div className="group-block">
        <p className="muted">Cada linha é um passo. Leia da esquerda para a direita.</p>
        <PathList config={config} rows={config.transitions} onChange={(transitions) => onChange({ ...config, transitions })} />
        <button type="button" className="ghost add-soft" onClick={() => onChange({ ...config, transitions: [...config.transitions, blank] })}>Adicionar passo</button>
      </div>
      <details className="adv-box">
        <summary>Quantos passos gerar</summary>
        <div className="fields">
          <label className="field">
            <span>Passos seguidos</span>
            <input aria-label="Passos seguidos" inputMode="numeric" value={String(config.length)} onChange={(event) => onChange({ ...config, length: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Quantidade de caminhos</span>
            <input aria-label="Quantidade de caminhos" placeholder="Todos" value={config.count ?? ''} onChange={(event) => onChange({ ...config, count: event.target.value.trim() === '' ? null : Number(event.target.value) })} />
          </label>
        </div>
        <p className="muted">1 gera só o primeiro passo. Em branco, a quantidade mostra todos os caminhos.</p>
      </details>
      <details className="adv-box">
        <summary>Um passo que o teste deve barrar</summary>
        <p className="muted">Um passo que você não cadastrou simplesmente não aparece. Escreva aqui só o que o teste precisa tentar e ver recusado.</p>
        <PathList config={config} rows={config.forbidden} onChange={(forbidden) => onChange({ ...config, forbidden })} />
        <button type="button" className="ghost add-soft" onClick={() => onChange({ ...config, forbidden: [...config.forbidden, { ...blank, id: nid() }] })}>Adicionar recusa</button>
      </details>
    </div>
  )
}

function PathList({
  config,
  rows,
  onChange,
}: {
  config: StateConfig
  rows: StateConfig['transitions']
  onChange: (rows: StateConfig['transitions']) => void
}) {
  if (!rows.length) return <p className="muted">Nenhum passo ainda.</p>
  return (
    <div className="path-list">
      {rows.map((row) => (
        <div key={row.id} className="path-line">
          <select aria-label="Sai de" value={row.fromId} onChange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, fromId: event.target.value } : item))}>
            {config.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
          <em>quando</em>
          <select aria-label="Acontece" value={row.eventId} onChange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, eventId: event.target.value } : item))}>
            {config.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <em>vai para</em>
          <select aria-label="Chega em" value={row.toId} onChange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, toId: event.target.value } : item))}>
            {config.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
          <input
            className={row.expected.trim() ? undefined : 'is-empty'}
            aria-label="O que o teste espera"
            placeholder="Não preenchido"
            value={row.expected}
            onChange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, expected: event.target.value } : item))}
          />
          <button type="button" className="ghost" onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>Remover</button>
        </div>
      ))}
    </div>
  )
}

export function PermissionPanel({ config, onChange }: { config: PermissionConfig; onChange: (config: PermissionConfig) => void }) {
  function setCell(key: string, mark: PermissionMark) {
    onChange({ ...config, cells: { ...config.cells, [key]: mark } })
  }
  return (
    <div className="stack">
      <div className="group-block group-block-perfil">
        <NameList label="Perfis" items={config.profiles} onChange={(profiles) => onChange({ ...config, profiles })} />
      </div>
      <div className="group-block group-block-acao">
        <NameList label="Ações" items={config.actions} onChange={(actions) => onChange({ ...config, actions })} />
      </div>
      <div className="group-block group-block-condicao">
        <NameList label="Condições" items={config.conditions} onChange={(conditions) => onChange({ ...config, conditions })} />
      </div>
      <p className="muted">Em cada perfil, escolha se a ação pode acontecer. Embaixo, escreva o que o teste deve ver. Vazio fica como não preenchido.</p>
      <div className="sheet-wrap">
        <table className="sheet strategy-sheet">
          <thead>
            <tr>
              <th>Ação</th>
              {config.profiles.map((profile) => <th key={profile.id}>{profile.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {config.actions.map((action, row) => (
              <tr key={action.id}>
                <th>{action.name}</th>
                {config.profiles.map((profile, col) => {
                  const key = cellKey(profile.id, action.id)
                  const mark = config.cells[key] ?? 'indefinido'
                  return (
                    <td key={profile.id}>
                      <div className="perm-cell">
                        <label>
                          <span>Pode?</span>
                          <select id={`mx-${row}-${col}`} aria-label={`${profile.name} ${action.name}`} value={mark} onChange={(event) => setCell(key, event.target.value as PermissionMark)} onKeyDown={(event) => moveFocus(event, row, col)}>
                            <option value="permitir">Pode</option>
                            <option value="negar">Não pode</option>
                            <option value="condicional">Depende</option>
                            <option value="indefinido">Ainda não</option>
                          </select>
                        </label>
                        {mark === 'condicional' ? (
                          <label>
                            <span>Condição</span>
                            <select aria-label={`Condição de ${profile.name} ${action.name}`} value={config.conditionByCell[key] ?? ''} onChange={(event) => onChange({ ...config, conditionByCell: { ...config.conditionByCell, [key]: event.target.value } })}>
                              <option value="">Escolha</option>
                              {config.conditions.map((condition) => <option key={condition.id} value={condition.id}>{condition.name}</option>)}
                            </select>
                          </label>
                        ) : null}
                        <label>
                          <span>O que acontece</span>
                          <input
                            className={(config.expected[key] ?? '').trim() ? undefined : 'is-empty'}
                            aria-label={`O que acontece em ${profile.name} ${action.name}`}
                            placeholder="Não preenchido"
                            value={config.expected[key] ?? ''}
                            onChange={(event) => onChange({ ...config, expected: { ...config.expected, [key]: event.target.value } })}
                          />
                        </label>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VariationPanel({ config, onChange }: { config: VariationConfig; onChange: (config: VariationConfig) => void }) {
  let keys: string[] = []
  try {
    const parsed = JSON.parse(config.baseText) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) keys = Object.keys(parsed)
  } catch {
    keys = []
  }
  function toggleChange(kind: VariationKind) {
    onChange({ ...config, changes: config.changes.includes(kind) ? config.changes.filter((item) => item !== kind) : [...config.changes, kind] })
  }
  return (
    <div className="stack">
      <label className="field">
        <span>Registro base</span>
        <textarea className="code" aria-label="Registro JSON" rows={8} value={config.baseText} onChange={(event) => onChange({ ...config, baseText: event.target.value })} />
      </label>
      <div className="strategy-checks">
        {keys.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={config.fields.includes(key)}
              onChange={(event) => onChange({ ...config, fields: event.target.checked ? [...config.fields, key] : config.fields.filter((item) => item !== key) })}
            /> {key}
          </label>
        ))}
      </div>
      <div className="chips">
        {CHANGES.map((change) => (
          <button key={change.id} type="button" aria-pressed={config.changes.includes(change.id)} onClick={() => toggleChange(change.id)}>{change.label}</button>
        ))}
      </div>
      <label className="strategy-checks">
        <input type="checkbox" checked={config.onePerCase} onChange={(event) => onChange({ ...config, onePerCase: event.target.checked })} /> Um campo por caso
      </label>
      <label className="field">
        <span>Limite de caracteres</span>
        <input aria-label="Limite de caracteres" inputMode="numeric" value={String(config.limit)} onChange={(event) => onChange({ ...config, limit: Number(event.target.value) })} />
      </label>
    </div>
  )
}

export function FilePanel({ config, onChange }: { config: FileComboConfig; onChange: (config: FileComboConfig) => void }) {
  const families = FAM as { n: string; exts: string[] }[]
  function toggleExtension(extension: string) {
    const has = config.extensions.includes(extension)
    onChange({
      ...config,
      extensions: has ? config.extensions.filter((item) => item !== extension) : [...config.extensions, extension],
      selected: has ? config.selected.filter((item) => item.extension !== extension) : config.selected,
    })
  }
  function toggleCell(extension: string, condition: FileConditionId) {
    const has = config.selected.some((item) => item.extension === extension && item.condition === condition)
    onChange({
      ...config,
      selected: has
        ? config.selected.filter((item) => item.extension !== extension || item.condition !== condition)
        : [...config.selected, { extension, condition }],
    })
  }
  return (
    <div className="stack">
      <div className="group-grid">
        {families.map((family) => (
          <div key={family.n}>
            <h3>{family.n}</h3>
            <div className="chips">
              {family.exts.map((extension) => (
                <button key={extension} type="button" aria-pressed={config.extensions.includes(extension)} onClick={() => toggleExtension(extension)}>{extension}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fields">
        <label className="field">
          <span>Nome base</span>
          <input aria-label="Nome base" value={config.nome} onChange={(event) => onChange({ ...config, nome: event.target.value })} />
        </label>
        <label className="field">
          <span>Tamanho</span>
          <input aria-label="Tamanho" inputMode="numeric" value={String(config.tam)} onChange={(event) => onChange({ ...config, tam: Number(event.target.value) })} />
        </label>
        <label className="field">
          <span>Unidade</span>
          <select aria-label="Unidade" value={config.unid} onChange={(event) => onChange({ ...config, unid: event.target.value as FileComboConfig['unid'] })}>
            <option>B</option>
            <option>KB</option>
            <option>MB</option>
            <option>GB</option>
          </select>
        </label>
        <label className="field">
          <span>Conteúdo real da extensão divergente</span>
          <select aria-label="Conteúdo real" value={config.real} onChange={(event) => onChange({ ...config, real: event.target.value })}>
            {['PDF', 'PNG', 'ZIP', 'TXT', 'DOCX'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {config.extensions.length ? (
        <div className="sheet-wrap">
          <table className="sheet strategy-sheet">
            <thead>
              <tr>
                <th>Extensão</th>
                {FILE_CONDITIONS.map((condition) => <th key={condition.id}>{condition.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {config.extensions.map((extension, row) => (
                <tr key={extension}>
                  <th>{extension}</th>
                  {FILE_CONDITIONS.map((condition, col) => {
                    const pressed = config.selected.some((item) => item.extension === extension && item.condition === condition.id)
                    return (
                      <td key={condition.id}>
                        <button
                          id={`mx-${row}-${col}`}
                          type="button"
                          aria-pressed={pressed}
                          aria-label={`${extension} ${condition.label}`}
                          onClick={() => toggleCell(extension, condition.id)}
                          onKeyDown={(event) => moveFocus(event, row, col)}
                        >
                          {pressed ? 'Sim' : 'Não'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">Escolha as extensões para montar a grade.</p>}
    </div>
  )
}
