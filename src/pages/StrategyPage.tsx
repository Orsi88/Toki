import { useMemo, useState, type ReactNode } from 'react'
import { fmtBytes, rng } from '../domain/mfEngine.ts'
import { FILE_TOTAL_LIMIT, generateFiles, zipArtifacts, type FileArtifact } from '../domain/files.ts'
import {
  STRATEGIES,
  bindingTargets,
  defaultComboConfig,
  defaultDecisionConfig,
  defaultFileComboConfig,
  defaultPartitionConfig,
  defaultPermissionConfig,
  defaultStateConfig,
  defaultVariationConfig,
  fileRequests,
  materialize,
  planCombinations,
  planDecision,
  planFileCombos,
  planPartitions,
  planPermissions,
  planStates,
  planVariations,
  strategyToCsv,
  strategyToJson,
  type PlannedCase,
  type StrategyId,
  type StrategyPlan,
  type ValueBinding,
} from '../domain/strategy/index.ts'
import type { ComboConfig } from '../domain/strategy/combinations.ts'
import type { DecisionConfig } from '../domain/strategy/decision.ts'
import type { FileComboConfig } from '../domain/strategy/files.ts'
import type { PartitionConfig } from '../domain/strategy/partitions.ts'
import type { PermissionConfig } from '../domain/strategy/permissions.ts'
import type { StateConfig } from '../domain/strategy/states.ts'
import type { VariationConfig } from '../domain/strategy/variations.ts'
import { copyText, downloadBlob, downloadBytes, downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { ClearButton } from '../ui/ClearButton.tsx'
import { BindingEditor, CaseTable, Coverage, Totals, VariationDiff } from '../ui/strategy/editors.tsx'
import { ComboPanel, DecisionPanel, FilePanel, PartitionPanel, PermissionPanel, StatePanel, VariationPanel } from '../ui/strategy/panels.tsx'

export function StrategyChooser({ onOpen }: { onOpen: (id: StrategyId) => void }) {
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Massa por estratégia</h1>
        <p>Configure regras, limites e combinações para gerar massas direcionadas aos seus cenários de teste.</p>
      </header>
      <div className="strategy-picks">
        {STRATEGIES.map((item) => (
          <button key={item.id} type="button" className="pick" onClick={() => onOpen(item.id)}>
            <span className="strategy-sketch">{SKETCH[item.id]}</span>
            <h2>{item.name}</h2>
            <p>{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function StrategyPage({
  strategy,
  onToast,
}: {
  strategy: StrategyId
  onToast: (message: string | Notice, bad?: boolean) => void
}) {
  const [partitions, setPartitions] = useState<PartitionConfig>(defaultPartitionConfig)
  const [decision, setDecision] = useState<DecisionConfig>(defaultDecisionConfig)
  const [combos, setCombos] = useState<ComboConfig>(defaultComboConfig)
  const [states, setStates] = useState<StateConfig>(defaultStateConfig)
  const [permissions, setPermissions] = useState<PermissionConfig>(defaultPermissionConfig)
  const [variations, setVariations] = useState<VariationConfig>(defaultVariationConfig)
  const [files, setFiles] = useState<FileComboConfig>(defaultFileComboConfig)
  const [bindings, setBindings] = useState<ValueBinding[]>([])
  const [generated, setGenerated] = useState<PlannedCase[] | null>(null)
  const [artifacts, setArtifacts] = useState<FileArtifact[] | null>(null)
  const [stamp, setStamp] = useState('')
  const [busy, setBusy] = useState(false)

  const signature = JSON.stringify({ strategy, partitions, decision, combos, states, permissions, variations, files, bindings })
  const built = useMemo(() => {
    if (strategy === 'particoes') {
      const result = planPartitions(partitions)
      return { plan: result.plan, ruler: result.ruler }
    }
    if (strategy === 'decisao') return { plan: planDecision(decision), ruler: null }
    if (strategy === 'combinacoes') return { plan: planCombinations(combos), ruler: null }
    if (strategy === 'estados') return { plan: planStates(states), ruler: null }
    if (strategy === 'permissoes') return { plan: planPermissions(permissions), ruler: null }
    if (strategy === 'variacoes') return { plan: planVariations(variations), ruler: null }
    return { plan: planFileCombos(files), ruler: null }
  }, [strategy, partitions, decision, combos, states, permissions, variations, files])
  const plan = built.plan
  const fresh = generated !== null && stamp === signature
  const targets = bindingTargets(plan.cases)
  const labels = totalLabels(strategy, plan)

  function reset() {
    setPartitions(defaultPartitionConfig())
    setDecision(defaultDecisionConfig())
    setCombos(defaultComboConfig())
    setStates(defaultStateConfig())
    setPermissions(defaultPermissionConfig())
    setVariations(defaultVariationConfig())
    setFiles(defaultFileComboConfig())
    setBindings([])
    setGenerated(null)
    setArtifacts(null)
    setStamp('')
    onToast('Configurações e prévia limpas.')
  }

  async function generate() {
    if (plan.errors.length || busy) return
    setBusy(true)
    try {
      if (strategy === 'arquivos') {
        const produced: FileArtifact[] = []
        let running = 0
        const seed = Math.floor(Math.random() * 1_000_000_000)
        for (const request of fileRequests(files)) {
          const batch = await generateFiles(request, seed + produced.length)
          for (const file of batch) {
            running += file.sizeBytes
            if (running > FILE_TOTAL_LIMIT) {
              throw new Error(`O lote passou de ${fmtBytes(FILE_TOTAL_LIMIT)} ao montar ${file.filename}. Nada foi entregue pela metade.`)
            }
            produced.push(file)
          }
        }
        setArtifacts(produced)
        setGenerated(plan.cases.map((item, index) => ({
          ...item,
          concrete: 'gerado' as const,
          note: '',
          inputs: [
            ...item.inputs,
            { key: 'arquivo', label: 'Arquivo', value: produced[index]?.path ?? '' },
            { key: 'bytes', label: 'Bytes', value: String(produced[index]?.sizeBytes ?? '') },
            { key: 'checksum', label: 'SHA-256', value: produced[index]?.checksum ?? '' },
          ],
        })))
      } else {
        setArtifacts(null)
        setGenerated(materialize(plan.cases, bindings, rng(Math.floor(Math.random() * 1_000_000_000))))
      }
      setStamp(signature)
      onToast('Massa gerada.')
    } catch (caught) {
      setGenerated(null)
      setArtifacts(null)
      onToast(caught instanceof Error ? caught.message : 'Falha ao gerar a massa.', true)
    } finally {
      setBusy(false)
    }
  }

  async function zip() {
    if (!artifacts?.length) return
    const blob = await zipArtifacts(artifacts)
    downloadBlob('massa_arquivos.zip', blob)
    onToast(downloadNotice('massa_arquivos.zip'))
  }

  const preview = fresh && generated ? generated : plan.cases
  const showCases = strategy !== 'decisao' && strategy !== 'variacoes'
  const current = STRATEGIES.find((item) => item.id === strategy)

  return (
    <div className="work">
      <ClearButton disabled={busy} onClick={reset} />
      <section className="step">
        <header className="step-title">
          <b>1</b>
          <div>
            <h2>{current?.name}</h2>
            <p>{HINT[strategy]}</p>
          </div>
        </header>
        {strategy === 'particoes' ? <PartitionPanel config={partitions} ruler={built.ruler} onChange={setPartitions} /> : null}
        {strategy === 'decisao' ? <DecisionPanel config={decision} onChange={setDecision} /> : null}
        {strategy === 'combinacoes' ? <ComboPanel config={combos} onChange={setCombos} /> : null}
        {strategy === 'estados' ? <StatePanel config={states} onChange={setStates} /> : null}
        {strategy === 'permissoes' ? <PermissionPanel config={permissions} onChange={setPermissions} /> : null}
        {strategy === 'variacoes' ? <VariationPanel config={variations} onChange={setVariations} /> : null}
        {strategy === 'arquivos' ? <FilePanel config={files} onChange={setFiles} /> : null}
        {plan.errors.map((error) => <p key={error} className="banner bad">{error}</p>)}
        {!plan.errors.length && plan.detail ? <p className="muted">{plan.detail}</p> : null}
        {!plan.errors.length && strategy === 'combinacoes' ? <Totals plan={plan} labels={labels} /> : null}
        {!plan.errors.length ? <Coverage plan={plan} /> : null}
        {!plan.errors.length && showCases ? <CaseTable cases={preview} /> : null}
        {strategy === 'variacoes' && !plan.errors.length ? <VariationDiff cases={preview} /> : null}
        {targets.length ? (
          <details className="adv-box">
            <summary>Vincular a um gerador</summary>
            <BindingEditor targets={targets} bindings={bindings} onChange={setBindings} />
          </details>
        ) : null}
        {generated && !fresh ? <p className="banner">A definição mudou. Gere de novo para exportar esta versão.</p> : null}
        <button id="mf-generate" className="primary" type="button" disabled={Boolean(plan.errors.length) || !plan.cases.length || busy} onClick={generate}>
          {busy ? 'Gerando...' : 'Gerar massa'}
        </button>
        <div className="row-actions row-actions-4">
          <button type="button" disabled={!fresh} onClick={() => { if (generated) { void copyText(strategyToCsv(generated)); onToast('CSV copiado.') } }}>Copiar CSV</button>
          <button type="button" disabled={!fresh} onClick={() => { if (generated) { void copyText(strategyToJson(generated)); onToast('JSON copiado.') } }}>Copiar JSON</button>
          <button type="button" disabled={!fresh} onClick={() => { if (!generated) return; downloadText('massa.csv', strategyToCsv(generated), 'text/csv;charset=utf-8'); onToast(downloadNotice('massa.csv')) }}>Baixar CSV</button>
          <button type="button" disabled={!fresh} onClick={() => { if (!generated) return; downloadText('massa.json', strategyToJson(generated), 'application/json'); onToast(downloadNotice('massa.json')) }}>Baixar JSON</button>
          {strategy === 'arquivos' ? <button type="button" disabled={!fresh || !artifacts?.length} onClick={() => { void zip() }}>Baixar ZIP</button> : null}
        </div>
        {fresh ? artifacts?.map((file) => (
          <button
            key={file.path}
            type="button"
            className="ghost"
            onClick={() => {
              downloadBytes(file.filename, file.bytes, 'application/octet-stream')
              onToast(downloadNotice(file.filename))
            }}
          >
            Baixar {file.filename}
          </button>
        )) : null}
      </section>
    </div>
  )
}

const SKETCH: Record<StrategyId, ReactNode> = {
  particoes: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <rect x="8" y="20" width="144" height="8" rx="4" fill="currentColor" opacity=".2" />
      <rect x="36" y="20" width="88" height="8" rx="4" fill="currentColor" opacity=".75" />
      <path d="M20 14v20M52 12v24M108 12v24M140 14v20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  decisao: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <rect x="16" y="8" width="40" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="64" y="8" width="40" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="112" y="8" width="32" height="14" rx="3" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="16" y="26" width="40" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="64" y="26" width="40" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="112" y="26" width="32" height="14" rx="3" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  combinacoes: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <path d="M28 14h48M28 34h48M76 14v20" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="28" cy="14" r="5" fill="currentColor" />
      <circle cx="28" cy="34" r="5" fill="currentColor" />
      <circle cx="76" cy="14" r="5" fill="currentColor" />
      <circle cx="76" cy="34" r="5" fill="currentColor" />
      <circle cx="124" cy="24" r="5" fill="currentColor" opacity=".35" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  estados: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <rect x="12" y="12" width="44" height="24" rx="12" fill="currentColor" opacity=".75" />
      <path d="M64 24h32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M90 18l8 6-8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="104" y="12" width="44" height="24" rx="12" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  permissoes: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <rect x="36" y="6" width="88" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M80 6v36M36 24h88" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M50 16l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M98 15l8 8M106 15l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  variacoes: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <rect x="18" y="8" width="52" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="90" y="8" width="52" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M28 18h32M28 28h24M100 18h32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M100 28h24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  arquivos: (
    <svg viewBox="0 0 160 48" aria-hidden="true">
      <path d="M28 8h22l10 10v22H28z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M50 8v10h10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M78 8h22l10 10v22H78z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M100 8v10h10" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
}

const HINT: Record<StrategyId, string> = {
  particoes: 'Informe mínimo, máximo e passo. Os pontos de teste aparecem na tabela.',
  decisao: 'Informe condições e valores. O resultado de cada combinação você escreve na tabela.',
  combinacoes: 'Cadastre os parâmetros e, se precisar, o que não pode aparecer junto.',
  estados: 'Dê nome às situações e escreva cada passo: de onde sai, o que acontece e para onde vai.',
  permissoes: 'Diga, em cada perfil, se a ação pode acontecer e o que o teste deve ver.',
  variacoes: 'Parta de um JSON e escolha o que muda em cada caso.',
  arquivos: 'Marque a extensão e a condição. O ZIP usa o gerador de arquivos.',
}

function totalLabels(strategy: StrategyId, plan: StrategyPlan): [string, string, string] {
  if (strategy === 'combinacoes' && plan.coverage?.unit === 'pares') return ['Pares possíveis', 'Pares excluídos', 'Casos gerados']
  if (strategy === 'combinacoes' && plan.coverage?.unit === 'trios') return ['Trios possíveis', 'Trios excluídos', 'Casos gerados']
  if (strategy === 'estados') return ['Sequências possíveis', 'Excluídas', 'Casos gerados']
  return ['Combinações possíveis', 'Excluídas', 'Casos gerados']
}
