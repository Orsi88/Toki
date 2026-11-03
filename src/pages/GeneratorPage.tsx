import { useEffect, useMemo, useState } from 'react'
import { recordsToCsv, recordsToJson, splitDiagnostics, type GeneratedItem } from '../domain/export.ts'
import { ENG, genStruct, genText, key, rng, setReferenceDate } from '../domain/mfEngine.ts'
import { copyText, downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { CopyButton } from '../ui/CopyButton.tsx'
import { STEPS } from '../domain/steps.ts'
import { FieldList, Tip, fieldVisible, type EngineField } from '../ui/Fields.tsx'
import { isColor, isMeasure, parseColor } from '../domain/values.ts'
import { CoordinateMap, ValueResults } from '../ui/Results.tsx'
import { ClearButton } from '../ui/ClearButton.tsx'
import { VaryButton } from '../ui/VaryButton.tsx'

type Config = Record<string, unknown>

function todayInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function applyQuery(def: Config, query: URLSearchParams) {
  const next: Config = structuredClone(def)
  for (const [name, value] of query) {
    if (!(name in next)) continue
    const current = next[name]
    if (typeof current === 'boolean') next[name] = value === 'true'
    else if (typeof current === 'number') next[name] = Number(value)
    else if (Array.isArray(current)) next[name] = value.split(',').filter(Boolean)
    else next[name] = value
  }
  return next
}

function validate(id: string, config: Config) {
  if (id === 'identidade' && (!Array.isArray(config.campos) || config.campos.length === 0)) {
    return 'Selecione ao menos um campo da ficha.'
  }
  if ('qtd' in config) {
    const count = config.qtd
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 1000) {
      return 'A quantidade precisa ser um inteiro de 1 a 1000.'
    }
  }
  if (id === 'numero' && config.tipo === 'Sequência' && Number(config.passo) === 0) {
    return 'Passo zero não gera sequência. Informe um passo diferente de zero.'
  }
  if (id === 'numero' && config.regra === 'Valores repetidos' && Number(config.qtd) < 2) {
    return 'Valores repetidos precisam de quantidade 2 ou mais.'
  }
  if (id === 'texto' && config.modo === 'Sequência aleatória') {
    const picked = ['maiusc', 'minusc', 'numeros', 'acentos', 'especiais', 'espacos', 'emojis', 'unicode'].some((name) => config[name])
    if (!picked && !String(config.custom || '').length) return 'Selecione ao menos uma classe de caracteres.'
  }
  if (id === 'texto' && !(config.modo === 'História' && config.medida === 'Versão')) {
    const size = Number(config.tamanho)
    if (!Number.isInteger(size) || size < 0 || size > 1_000_000) return 'O tamanho precisa ser um inteiro de 0 a 1.000.000.'
  }
  if (id === 'numero' && isColor(String(config.tipo))) {
    if (config.origemCor === 'Informada' && config.regraCor === 'Válida' && !parseColor(String(config.corBase || ''))) {
      return 'A cor informada precisa ser #RRGGBB, rgb() ou rgba() com canais de 0 a 255.'
    }
    if (config.repr === 'RGBA') {
      const alpha = Number(config.alfa)
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 100) return 'O alfa precisa estar entre 0 e 100.'
    }
  }
  if (id === 'numero' && isMeasure(String(config.tipo)) && Number(config.min) > Number(config.max)) {
    return 'O mínimo está acima do máximo.'
  }
  if (id === 'mapa' && config.regiao === 'Informada') {
    const bounds = [config.latMin, config.latMax, config.lngMin, config.lngMax].map(Number)
    if (bounds.some((value) => !Number.isFinite(value))) return 'A área informada precisa de latitude e longitude numéricas.'
    if (bounds[0] > bounds[1] || bounds[2] > bounds[3]) return 'Na área informada, o mínimo está acima do máximo.'
    if (bounds[0] < -90 || bounds[1] > 90 || bounds[2] < -180 || bounds[3] > 180) return 'A área informada precisa caber em latitude -90 a 90 e longitude -180 a 180.'
  }
  if (id === 'mapa' && config.tipo !== 'Área' && config.regra === 'Fora da região' && config.regiao === 'Mundo') {
    return 'Fora da região pede Brasil ou uma área informada.'
  }
  if (id === 'estrutura') {
    const format = String(config.formato)
    if (format === 'Código de barras' || format === 'QR Code') {
      const count = Number(config.qtdCodigos)
      if (!Number.isInteger(count) || count < 1 || count > 20) return 'A quantidade de códigos precisa ser um inteiro de 1 a 20.'
      if (format === 'Código de barras' && config.conteudoModo === 'Informado' && !String(config.conteudo || '').trim() && config.regraCodigo !== 'Conteúdo incompatível') {
        return 'Informe o conteúdo do código.'
      }
      if (format === 'QR Code' && config.conteudoModo === 'Informado' && !String(config.conteudo || '').trim() && config.regraQr === 'Válido') {
        return 'Informe o conteúdo do QR.'
      }
      if (format === 'QR Code') {
        const side = Number(config.lado)
        const margin = Number(config.margem)
        if (!Number.isInteger(side) || side < 64 || side > 512) return 'O lado do QR precisa ser um inteiro de 64 a 512.'
        if (!Number.isInteger(margin) || margin < 0 || margin > 10) return 'A margem do QR precisa ser um inteiro de 0 a 10.'
      }
    } else if (format === 'Lista') {
      const count = Number(config.itens)
      if (!Number.isInteger(count) || count < 1 || count > 100) return 'A lista precisa de 1 a 100 itens.'
    } else if (format === 'Hierarquia') {
      const levels = Number(config.niveis)
      const children = Number(config.filhos)
      if (!Number.isInteger(levels) || levels < 2 || levels > 4) return 'Os níveis precisam ser um inteiro de 2 a 4.'
      if (!Number.isInteger(children) || children < 1 || children > 4) return 'Os filhos por nível precisam ser um inteiro de 1 a 4.'
      if (config.saida === 'Aninhada' && config.regraHier === 'Referência circular') {
        return 'Referência circular não cabe numa saída aninhada. Escolha a saída plana.'
      }
    } else if (format === 'Série') {
      const points = Number(config.pontos)
      const series = Number(config.seriesQtd)
      if (!Number.isInteger(points) || points < 1 || points > 100) return 'A série precisa de 1 a 100 pontos.'
      if (!Number.isInteger(series) || series < 1 || series > 3) return 'Use de 1 a 3 séries.'
      if (!Number.isFinite(Number(config.intervaloMin)) || !Number.isFinite(Number(config.intervaloMax))) return 'O intervalo da série precisa ser numérico.'
      if (Number(config.intervaloMin) > Number(config.intervaloMax)) return 'O mínimo da série está acima do máximo.'
      if (config.padrao === 'Datas fora de ordem' && config.catTipo !== 'Datas') return 'Datas fora de ordem pedem a sequência de datas.'
      if (config.padrao === 'Categorias repetidas' && config.catTipo === 'Datas') return 'Categorias repetidas pedem categorias, não datas.'
    } else {
      const count = Number(config.registros)
      if (!Number.isInteger(count) || count < 1 || count > 100) return 'Registros precisa ser um inteiro de 1 a 100.'
      if (!Array.isArray(config.campos) || config.campos.length === 0) return 'Selecione ao menos um campo.'
    }
  }
  return null
}

function structureConfig(config: Config) {
  const fields = Array.isArray(config.campos) && config.campos.length ? config.campos as string[] : ['ID']
  const extras = Array.isArray(config.camposExtras) ? config.camposExtras as { name: string; type: string }[] : []
  const tipo = new Map(extras.map((item) => [item.name, item.type]))
  return {
    ...config,
    cols: fields.map((label, index) => {
      const type = tipo.get(label) || label
      const name = !tipo.has(label) && label === 'ID' ? 'id' : key(label)
      return { id: index + 1, name: name || `campo_${index + 1}`, type }
    }),
  }
}

export function GeneratorPage({
  id,
  query,
  onToast,
  firstStep = 1,
}: {
  id: string
  query: URLSearchParams
  onToast: (message: string | Notice, bad?: boolean) => void
  firstStep?: number
}) {
  const engine = (ENG as unknown as Record<string, {
    kind: string
    def: Config
    fields: EngineField[]
    note?: () => string
    run: (config: Config, random: () => number) => GeneratedItem[]
  }>)[id]
  const initial = useMemo(() => applyQuery(engine.def, query), [engine, query])
  const [config, setConfig] = useState<Config>(initial)
  const [reference, setReference] = useState(todayInput)
  const [fixedSeed, setFixedSeed] = useState(false)
  const [seedText, setSeedText] = useState('4821')
  const [previewSeed, setPreviewSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [preview, setPreview] = useState<GeneratedItem[]>([])
  const [diagnostics, setDiagnostics] = useState<GeneratedItem[]>([])
  const [text, setText] = useState('')
  const [code, setCode] = useState<{ code: string; tag: string; tone: string; info: string; svg?: string } | null>(null)
  const [lote, setLote] = useState<GeneratedItem[] | null>(null)
  const [loteText, setLoteText] = useState<string | null>(null)
  const [loteCode, setLoteCode] = useState<typeof code>(null)
  const [loteSeed, setLoteSeed] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const error = validate(id, config)
  const queryKey = query.toString()

  useEffect(() => {
    setConfig(applyQuery(engine.def, new URLSearchParams(queryKey)))
    setLote(null)
    setLoteText(null)
    setLoteCode(null)
    setStale(false)
  }, [engine, id, queryKey])

  useEffect(() => {
    if (error) return
    const date = new Date(`${reference}T12:00:00`)
    setReferenceDate(date)
    const random = rng(previewSeed)
    if (engine.kind === 'text') setText(genText(config, random))
    else if (engine.kind === 'code') setCode(genStruct(structureConfig(config), random))
    else {
      const sample = { ...config }
      if (typeof sample.qtd === 'number') sample.qtd = Math.min(sample.qtd, 8)
      const items = engine.run(sample, random) as GeneratedItem[]
      const split = splitDiagnostics(items)
      setPreview(split.records)
      setDiagnostics(split.diagnostics)
    }
  }, [config, engine, error, previewSeed, reference])

  function update(name: string, value: unknown) {
    setConfig((current) => {
      // Na medida "Versão" o tamanho não vale; digitar um tamanho passa a medir por caracteres, como a dica do campo promete.
      if (id === 'texto' && name === 'tamanho' && current.medida === 'Versão') return { ...current, tamanho: value, medida: 'Caracteres' }
      if (id !== 'identidade' || name !== 'origem' || !Array.isArray(current.campos)) return { ...current, [name]: value }
      const next = new Set<string>()
      for (const field of current.campos as string[]) {
        if (value === 'Estrangeira') {
          if (field === 'CPF') next.add('Passaporte')
          else if (field === 'CEP' || field === 'Estado') next.add('País')
          else next.add(field)
          if (field === 'CPF') next.add('Nacionalidade')
        } else if (field === 'Passaporte') next.add('CPF')
        else if (field === 'País') next.add('Estado')
        else if (field !== 'Nacionalidade') next.add(field)
      }
      return { ...current, origem: value, campos: [...next] }
    })
    if (lote || loteText || loteCode) setStale(true)
  }

  function reset() {
    setConfig(structuredClone(engine.def))
    setReference(todayInput())
    setFixedSeed(false)
    setSeedText('4821')
    setPreview([])
    setDiagnostics([])
    setText('')
    setCode(null)
    setLote(null)
    setLoteText(null)
    setLoteCode(null)
    setLoteSeed(null)
    setStale(false)
    setPreviewSeed(Math.floor(Math.random() * 1_000_000_000))
    onToast('Configurações e prévia limpas.')
  }

  function vary() {
    setLote(null)
    setLoteText(null)
    setLoteCode(null)
    setLoteSeed(null)
    setStale(false)
    setPreviewSeed(Math.floor(Math.random() * 1_000_000_000))
  }

  function generate() {
    if (error) return
    const seed = fixedSeed ? Number(seedText) : Math.floor(Math.random() * 1_000_000_000)
    if (fixedSeed && (!Number.isInteger(seed) || seed < 0)) {
      onToast('A seed fixa precisa ser um inteiro maior ou igual a zero.', true)
      return
    }
    setReferenceDate(new Date(`${reference}T12:00:00`))
    const random = rng(seed)
    if (engine.kind === 'text') setLoteText(genText(config, random))
    else if (engine.kind === 'code') setLoteCode(genStruct(structureConfig(config), random))
    else {
      const split = splitDiagnostics(engine.run(config, random) as GeneratedItem[])
      setLote(split.records)
      setDiagnostics(split.diagnostics)
    }
    setLoteSeed(seed)
    setStale(false)
    document.getElementById('resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function copy(value: string) {
    const ok = await copyText(value)
    onToast(ok ? 'Copiado.' : 'Não foi possível copiar. O lote continua disponível.', !ok)
  }

  const grouped = useMemo(() => {
    const fields = engine.fields as EngineField[]
    const used = new Set<string>()
    const take = (names: string[] = []) => names.flatMap((name) => {
      const field = fields.find((item) => item.k === name)
      if (!field || used.has(name)) return []
      used.add(name)
      return [field]
    })
    const recipe = STEPS[id] ?? [['Configure as opções', '', fields.map((field) => field.k)] as [string, string, string[]]]
    const steps = recipe.map(([title, desc, keys, advanced]) => ({
      title,
      desc,
      fields: take(keys),
      advanced: take(advanced ?? []),
    })).filter((step) => step.fields.length || step.advanced.length)
    return { steps, rest: fields.filter((field) => !used.has(field.k)) }
  }, [engine, id])
  const shown = lote ?? preview
  const activeText = loteText ?? text
  const activeCode = loteCode ?? code
  const previewLimited = engine.kind !== 'text' && engine.kind !== 'code' && typeof config.qtd === 'number' && config.qtd > 8 && !lote
  const visibleSteps = grouped.steps.filter((step) => step.fields.some((field) => fieldVisible(field, config)) || step.advanced.some((field) => fieldVisible(field, config)))

  return (
    <div className="work">
      <ClearButton onClick={reset} />
      {visibleSteps.map((step, index) => (
        <section className="step" key={step.title}>
          <header className="step-title">
            <b>{index + firstStep}</b>
            <div>
              <div className="step-heading">
                <h2>{step.title}</h2>
                {index === 0 && engine.note ? <Tip text={engine.note()} /> : null}
              </div>
              {step.desc ? <p>{step.desc}</p> : null}
            </div>
          </header>
          {step.fields.length ? <FieldList fields={step.fields} config={config} onChange={update} /> : null}
          {step.advanced.length ? (
            <details className="adv-box">
              <summary>Opções avançadas</summary>
              <FieldList fields={step.advanced} config={config} onChange={update} />
            </details>
          ) : null}
        </section>
      ))}
      <section className="step">
        <header className="step-title">
          <b>{visibleSteps.length + firstStep}</b>
          <div>
            <h2>Defina a geração do lote</h2>
            <p>Quantidade, data de referência e seed usada na exportação.</p>
          </div>
        </header>
        <div className="fields">
          {grouped.rest.length ? <FieldList fields={grouped.rest} config={config} onChange={update} /> : null}
          <label className="field">
            <span>Data de referência</span>
            <input type="date" value={reference} onChange={(event) => { setReference(event.target.value); setStale(true) }} />
          </label>
          <label className="field">
            <span>Seed</span>
            <select value={fixedSeed ? 'fixa' : 'nova'} onChange={(event) => setFixedSeed(event.target.value === 'fixa')}>
              <option value="nova">Nova a cada geração</option>
              <option value="fixa">Fixa</option>
            </select>
          </label>
          {fixedSeed ? (
            <label className="field">
              <span>Valor da seed</span>
              <input value={seedText} onChange={(event) => setSeedText(event.target.value)} />
            </label>
          ) : null}
        </div>
        {error ? <p className="banner bad">{error}</p> : null}
        <button id="mf-generate" className="primary" type="button" disabled={Boolean(error)} onClick={generate}>
          Gerar lote
        </button>
      </section>
      <section className="panel" id="resultado">
        <header className="preview-head">
          <h2>{lote || loteText || loteCode ? 'Lote gerado' : 'Prévia'}</h2>
          <VaryButton disabled={Boolean(error)} onClick={vary} />
        </header>
        {stale ? <p className="banner">A configuração mudou. Exportar ainda usa o último lote, não a prévia nova.</p> : null}
        {previewLimited ? <p className="muted">Prévia das primeiras 8 linhas. O lote gerado traz as {String(config.qtd)} pedidas.</p> : null}
        {loteSeed !== null ? <p className="muted">Seed do lote: {loteSeed}. Data de referência: {reference}.</p> : null}
        {diagnostics.map((item) => <p key={item.rule} className="banner">{item.fields.map((field) => field.v).join(' ')}</p>)}
        {engine.kind === 'text' && (
          <>
            <div className="view-block">
              <div className="copy-block">
                <pre>{activeText || ' '}</pre>
                <CopyButton label="Copiar texto" onCopy={() => copy(activeText)} />
              </div>
              <p className="char-count">Qtd caracteres: {Array.from(activeText).length}</p>
            </div>
            <div className="row-actions">
              <button type="button" className="download" onClick={() => { downloadText('texto.txt', loteText ?? activeText); onToast(downloadNotice()) }}>Baixar TXT</button>
            </div>
          </>
        )}
        {engine.kind === 'code' && activeCode && (
          <>
            {activeCode.info ? <p>{activeCode.info}</p> : null}
            {activeCode.svg ? <div className="symbol-preview" dangerouslySetInnerHTML={{ __html: activeCode.svg }} /> : null}
            <div className="view-block">
              <div className="copy-block">
                <pre>{activeCode.code}</pre>
                <CopyButton label="Copiar conteúdo" onCopy={() => copy(activeCode.code)} />
              </div>
              <p className="char-count"><span className={`tone ${activeCode.tone}`}>{activeCode.tag}</span></p>
            </div>
            <div className="row-actions">
              <button type="button" className="download" disabled={!loteCode} onClick={() => {
                const format = String(config.formato || 'txt')
                const payload = loteCode?.code || ''
                if (format === 'Série' && config.saidaSerie === 'CSV') downloadText('serie.csv', payload, 'text/csv;charset=utf-8')
                else if (format === 'Lista') downloadText('lista.json', payload, 'application/json')
                else if (format === 'Hierarquia') downloadText('hierarquia.json', payload, 'application/json')
                else if (format === 'Série') downloadText('serie.json', payload, 'application/json')
                else if (format === 'Código de barras' || format === 'QR Code') downloadText('conteudo.txt', payload, 'text/plain;charset=utf-8')
                else {
                  const extension = format.toLowerCase()
                  downloadText(`estruturado.${extension === 'sql' ? 'sql' : extension}`, payload, 'text/plain;charset=utf-8')
                }
                onToast(downloadNotice())
              }}>Baixar lote</button>
              {loteCode?.svg ? <button type="button" className="download" onClick={() => {
                downloadText('codigo.svg', loteCode.svg || '', 'image/svg+xml')
                onToast(downloadNotice())
              }}>Baixar imagem</button> : null}
            </div>
          </>
        )}
        {engine.kind !== 'text' && engine.kind !== 'code' && (
          <>
            <ValueResults id={id} items={shown.slice(0, 100)} onCopy={copy} />
            {shown.length > 100 ? <p className="muted">Exibindo 100 de {shown.length}. Baixar CSV inclui o lote inteiro.</p> : null}
            <div className="row-actions">
              <button type="button" disabled={!lote?.length} onClick={() => lote && copy(recordsToCsv(lote).replace(/^\uFEFF/, ''))}>Copiar CSV</button>
              <button type="button" disabled={!lote?.length} onClick={() => {
                if (!lote) return
                downloadText('lote.csv', recordsToCsv(lote), 'text/csv;charset=utf-8')
                onToast(downloadNotice())
              }}>Baixar CSV</button>
              <button type="button" disabled={!lote?.length} onClick={() => {
                if (!lote) return
                downloadText('lote.json', recordsToJson(lote), 'application/json')
                onToast(downloadNotice())
              }}>Baixar JSON</button>
            </div>
          </>
        )}
      </section>
      {id === 'mapa' && shown.length ? (
        <section className="panel" aria-label="Mapa">
          <header className="preview-head">
            <h2>Mapa</h2>
          </header>
          <CoordinateMap key={shown.slice(0, 8).map((item) => item.fields.map((field) => field.v).join('|')).join('\n')} items={shown.slice(0, 100)} />
        </section>
      ) : null}
    </div>
  )
}
