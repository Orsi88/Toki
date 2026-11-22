import { useEffect, useMemo, useRef, useState } from 'react'
import { recordsToCsv, recordsToJson, splitDiagnostics, type GeneratedItem } from '../domain/export.ts'
import { ENG, genStruct, genText, key, rng, setReferenceDate } from '../domain/mfEngine.ts'
import { copyText, downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { STEPS } from '../domain/steps.ts'
import { FieldList, Switch, Tip, fieldOptions, fieldVisible, type EngineField } from '../ui/Fields.tsx'
import { EdgeCases } from '../ui/EdgeCases.tsx'
import { TypeStrip } from '../ui/TypeStrip.tsx'
import { optionIcon } from '../ui/optionIcon.ts'
import { isColor, isMeasure, parseColor } from '../domain/values.ts'
import { CoordinateMap, ValueResults } from '../ui/Results.tsx'
import { VaryButton } from '../ui/VaryButton.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { CartesianPlot } from '../ui/Plot.tsx'
import { AppointmentCard } from '../ui/Appointment.tsx'
import { mapEmbed } from '../domain/geo.ts'
import { ClearButton } from '../ui/ClearButton.tsx'

type Config = Record<string, unknown>
const ALL = 'Todas as variações'

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
  if (id === 'numero' && (isMeasure(String(config.tipo)) || config.tipo === 'Ponto cartesiano' || config.tipo === 'Pontos de função') && Number(config.min) > Number(config.max)) {
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

// Últimos ajustes de cada gerador, para quem volta sempre ao mesmo. Só conveniência: falhou, usa o padrão.
const STORE = (id: string) => `toki:gerador:v2:${id}`

function loadConfig(id: string, def: Config, query: URLSearchParams) {
  if ([...query.keys()].length) return applyQuery(def, query)
  try {
    const saved = JSON.parse(localStorage.getItem(STORE(id)) || 'null') as Config | null
    if (!saved || typeof saved !== 'object') return structuredClone(def)
    const next = structuredClone(def)
    for (const name of Object.keys(def)) {
      if (name in saved && typeof saved[name] === typeof def[name] && Array.isArray(saved[name]) === Array.isArray(def[name])) next[name] = saved[name]
    }
    return next
  } catch {
    return structuredClone(def)
  }
}

function newSeed() {
  return Math.floor(Math.random() * 1_000_000_000)
}

export function GeneratorPage({
  id,
  query,
  onToast,
}: {
  id: string
  query: URLSearchParams
  onToast: (message: string | Notice, bad?: boolean) => void
}) {
  const engine = (ENG as unknown as Record<string, {
    kind: string
    def: Config
    fields: EngineField[]
    note?: () => string
    run: (config: Config, random: () => number) => GeneratedItem[]
  }>)[id]
  const queryKey = query.toString()
  const [config, setConfig] = useState<Config>(() => loadConfig(id, engine.def, new URLSearchParams(queryKey)))
  const [reference, setReference] = useState(todayInput)
  const [fixedSeed, setFixedSeed] = useState(false)
  const [seedText, setSeedText] = useState('4821')
  const [randomSeed, setRandomSeed] = useState(newSeed)
  const [items, setItems] = useState<GeneratedItem[]>([])
  const [diagnostics, setDiagnostics] = useState<GeneratedItem[]>([])
  const [text, setText] = useState('')
  const [code, setCode] = useState<{ code: string; tag: string; tone: string; info: string; svg?: string } | null>(null)
  const seed = fixedSeed ? Number(seedText) : randomSeed
  const seedError = fixedSeed && (!Number.isInteger(seed) || seed < 0) ? 'A seed fixa precisa ser um inteiro maior ou igual a zero.' : null
  const error = validate(id, config) ?? seedError

  useEffect(() => {
    try { localStorage.setItem(STORE(id), JSON.stringify(config)) } catch { /* sem armazenamento: só não lembra */ }
  }, [config, id])

  // Gera sozinho: ao abrir, ao mudar um ajuste e ao pedir outro. Espera a digitação parar um instante.
  useEffect(() => {
    if (error) return
    const timer = window.setTimeout(() => {
      setReferenceDate(new Date(`${reference}T12:00:00`))
      const random = rng(seed)
      if (engine.kind === 'text') setText(genText(config, random))
      else if (engine.kind === 'code') setCode(genStruct(structureConfig(config), random))
      else {
        const split = splitDiagnostics(engine.run(config, random) as GeneratedItem[])
        setItems(split.records)
        setDiagnostics(split.diagnostics)
      }
    }, 120)
    return () => window.clearTimeout(timer)
  }, [config, engine, error, seed, reference])

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
  }

  function reset() {
    try { localStorage.removeItem(STORE(id)) } catch { /* nada a limpar */ }
    setConfig(structuredClone(engine.def))
    setReference(todayInput())
    setFixedSeed(false)
    setSeedText('4821')
    setRandomSeed(newSeed())
    onToast('Ajustes de volta ao padrão.')
  }

  async function copy(value: string, what = 'Copiado.') {
    const ok = await copyText(value)
    onToast(ok ? what : 'Não foi possível copiar.', !ok)
  }

  // O tipo (campo mostrado em cartões) fica no topo, antes da prévia; os ajustes trazem o resto.
  const typeField = (engine.fields as EngineField[]).find((field) => field.cards)
  const lastType = useRef<string | undefined>(undefined)
  const grouped = useMemo(() => {
    const fields = engine.fields as EngineField[]
    const used = new Set<string>(typeField ? [typeField.k] : [])
    const take = (names: string[] = []) => names.flatMap((name) => {
      const field = fields.find((item) => item.k === name)
      if (!field || used.has(name)) return []
      used.add(name)
      return [field]
    })
    const recipe = STEPS[id] ?? [['Opções', '', fields.map((field) => field.k)] as [string, string, string[]]]
    const steps = recipe.map(([title, desc, keys, advanced]) => ({
      title,
      desc,
      fields: take(keys),
      advanced: take(advanced ?? []),
    })).filter((step) => step.fields.length || step.advanced.length)
    return { steps, rest: fields.filter((field) => !used.has(field.k)) }
  }, [engine, id, typeField])
  const visibleSteps = grouped.steps.filter((step) => step.fields.some((field) => fieldVisible(field, config)) || step.advanced.some((field) => fieldVisible(field, config)))
  const list = engine.kind !== 'text' && engine.kind !== 'code'
  const first = items[0]
  // Os dadinhos de sempre: gera outro resultado (com seed fixa não muda, então fica desabilitado).
  const another = <VaryButton disabled={Boolean(error) || fixedSeed} onClick={() => setRandomSeed(newSeed())} />
  const geoLink = id === 'mapa' && first ? first.fields.find((field) => field.key === 'mapa')?.v ?? '' : ''
  const geoSrc = geoLink ? mapEmbed(geoLink) : null
  const plotted = id === 'numero' && (config.tipo === 'Ponto cartesiano' || config.tipo === 'Pontos de função')

  function downloadCode() {
    if (!code) return
    const format = String(config.formato || 'txt')
    if (format === 'Série' && config.saidaSerie === 'CSV') downloadText('serie.csv', code.code, 'text/csv;charset=utf-8')
    else if (format === 'Lista') downloadText('lista.json', code.code, 'application/json')
    else if (format === 'Hierarquia') downloadText('hierarquia.json', code.code, 'application/json')
    else if (format === 'Série') downloadText('serie.json', code.code, 'application/json')
    else if (format === 'Código de barras' || format === 'QR Code') downloadText('conteudo.txt', code.code, 'text/plain;charset=utf-8')
    else {
      const extension = format.toLowerCase()
      downloadText(`estruturado.${extension === 'sql' ? 'sql' : extension}`, code.code, 'text/plain;charset=utf-8')
    }
    onToast(downloadNotice())
  }

  return (
    <div className="work">
      <ClearButton onClick={reset} />

      {typeField && fieldVisible(typeField, config) ? (
        <>
          <TypeStrip
            label={typeof typeField.label === 'string' ? typeField.label : 'Tipo'}
            groups={[{ items: fieldOptions(typeField, config).filter((option) => option !== ALL).map((option) => ({ value: option, label: option, icon: optionIcon(option) })) }]}
            value={String(config[typeField.k] ?? '')}
            onChange={(value) => { lastType.current = value; update(typeField.k, value) }}
          />
          {fieldOptions(typeField, config).includes(ALL) ? (
            <div className="strip-all">
              <Switch
                checked={config[typeField.k] === ALL}
                label="Todas as variações: uma massa com cada tipo"
                onChange={(on) => update(typeField.k, on ? ALL : lastType.current ?? fieldOptions(typeField, config).find((option) => option !== ALL))}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <section className={`quick${id === 'estrutura' ? ' quick-plain' : ''}`} id="resultado" aria-label="Resultado" aria-live="polite">
        {error ? <p className="banner bad">{error}</p> : null}
        {!error && list && first ? (
          <>
            <div className="quick-head">
              <h2 className="quick-title">Prévia{items.length > 1 ? <span className="muted"> · 1º de {items.length}, o lote completo fica abaixo dos ajustes</span> : null}</h2>
              <div className="quick-actions">{another}</div>
            </div>
            {id === 'mapa' ? (
              <div className="geo-card">
                <div className="geo-info">
                  <span className={`tone ${first.tone}`}>{first.tag}</span>
                  <button type="button" className="geo-value" title="Clique para copiar" onClick={() => copy(first.fields[0]?.v ?? '')}>{first.fields[0]?.v}</button>
                  <dl className="geo-facts">
                    {first.fields.slice(1).filter((field) => field.key !== 'mapa').map((field) => (
                      <div key={field.key}>
                        <dt>{field.k}</dt>
                        <dd><button type="button" title="Copiar" onClick={() => copy(field.v)}>{field.v}</button></dd>
                      </div>
                    ))}
                  </dl>
                  {geoLink ? <a className="geo-link" href={geoLink} target="_blank" rel="noreferrer">Abrir no OpenStreetMap ↗</a> : null}
                </div>
                {geoSrc ? <iframe className="geo-map" title="Mapa da coordenada" src={geoSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className="geo-map geo-empty">Sem mapa para esta coordenada.</div>}
              </div>
            ) : id === 'borda' ? (
              <EdgeCases items={items} onCopy={(value) => copy(value)} />
            ) : id === 'data' ? (
              <AppointmentCard item={first} onCopy={(value) => copy(value)} />
            ) : plotted ? (
              <div className="plot-card">
                <ValueResults id={id} items={[first]} onCopy={(value) => copy(value)} />
                <CartesianPlot items={items.slice(0, 500)} line={config.tipo === 'Pontos de função'} />
              </div>
            ) : <ValueResults id={id} items={[first]} onCopy={(value) => copy(value)} />}
          </>
        ) : null}
        {!error && engine.kind === 'text' ? (
          <>
            <div className="quick-head">
              <span className="muted">{Array.from(text).length} caracteres</span>
              <div className="quick-actions">
                <IconButton icon="copy" tip="Copiar texto" primary onClick={() => copy(text, 'Texto copiado.')} />
                {another}
                <IconButton icon="download" tip="Baixar TXT" badge="TXT" onClick={() => { downloadText('texto.txt', text); onToast(downloadNotice()) }} />
              </div>
            </div>
            <pre className="quick-text">{text || ' '}</pre>
          </>
        ) : null}
        {!error && engine.kind === 'code' && code ? (
          <>
            <div className="quick-head">
              <span className={`tone ${code.tone}`}>{code.tag}</span>
              <div className="quick-actions">
                <IconButton icon="copy" tip="Copiar conteúdo" primary onClick={() => copy(code.code, 'Conteúdo copiado.')} />
                {another}
                <IconButton icon="download" tip="Baixar arquivo" onClick={downloadCode} />
                {code.svg ? <IconButton icon="image" tip="Baixar imagem (SVG)" badge="SVG" onClick={() => { downloadText('codigo.svg', code.svg || '', 'image/svg+xml'); onToast(downloadNotice()) }} /> : null}
              </div>
            </div>
            {code.info ? <p className="muted">{code.info}</p> : null}
            {code.svg ? <div className="symbol-preview" dangerouslySetInnerHTML={{ __html: code.svg }} /> : null}
            <pre className="quick-text">{code.code}</pre>
          </>
        ) : null}
        {diagnostics.map((item) => <p key={item.rule} className="banner">{item.fields.map((field) => field.v).join(' ')}</p>)}
      </section>

      <section className="step settings" aria-labelledby="ajustes">
        <header className="settings-head">
          <h2 id="ajustes">Ajustes</h2>
          {engine.note ? <Tip text={engine.note()} /> : null}
          <span className="muted">O resultado acompanha cada mudança.</span>
        </header>
        <div className="settings-grid">
        {visibleSteps.map((step) => (
          <div className="settings-group" key={step.title}>
            <div className="settings-label">
              <h3>{step.title}</h3>
              {step.desc ? <p>{step.desc}</p> : null}
            </div>
            <div className="settings-controls">
              {step.fields.length ? <FieldList fields={step.fields} config={config} onChange={update} /> : null}
              {step.advanced.length ? (
                <details className="adv-box">
                  <summary>Mais opções</summary>
                  <FieldList fields={step.advanced} config={config} onChange={update} />
                </details>
              ) : null}
            </div>
          </div>
        ))}
        {grouped.rest.length ? (
          <div className="settings-group">
            <div className="settings-label">
              <h3>Lote</h3>
              <p>Quantos itens gerar de uma vez.</p>
            </div>
            <div className="settings-controls">
              <FieldList fields={grouped.rest} config={config} onChange={update} />
            </div>
          </div>
        ) : null}
        </div>
        <details className="adv-box settings-adv">
          <summary>Avançado: data de referência e seed</summary>
          <div className="fields">
            <label className="field">
              <span>Data de referência</span>
              <input type="date" value={reference} onChange={(event) => setReference(event.target.value)} />
            </label>
            <label className="field">
              <span>Seed</span>
              <select value={fixedSeed ? 'fixa' : 'nova'} onChange={(event) => setFixedSeed(event.target.value === 'fixa')}>
                <option value="nova">Nova a cada “Outro”</option>
                <option value="fixa">Fixa (reproduz o mesmo lote)</option>
              </select>
            </label>
            {fixedSeed ? (
              <label className="field">
                <span>Valor da seed</span>
                <input inputMode="numeric" value={seedText} onChange={(event) => setSeedText(event.target.value)} />
              </label>
            ) : <p className="muted">Seed desta geração: {randomSeed}</p>}
          </div>
        </details>
      </section>

      {list && !error && items.length > 1 ? (
        <section className="panel" aria-labelledby="lote">
          <header className="preview-head">
            <h2 id="lote">Lote · {items.length} {items.length === 1 ? 'item' : 'itens'}</h2>
            <div className="row-actions lote-actions">
              <IconButton icon="copy" tip="Copiar o lote em CSV" badge="CSV" onClick={() => copy(recordsToCsv(items).replace(/^\uFEFF/, ''), 'CSV copiado.')} />
              <IconButton icon="download" tip="Baixar CSV" badge="CSV" onClick={() => { downloadText('lote.csv', recordsToCsv(items), 'text/csv;charset=utf-8'); onToast(downloadNotice()) }} />
              <IconButton icon="download" tip="Baixar JSON" badge="JSON" onClick={() => { downloadText('lote.json', recordsToJson(items), 'application/json'); onToast(downloadNotice()) }} />
            </div>
          </header>
          <ValueResults id={id} items={items.slice(0, 100)} onCopy={(value) => copy(value)} />
          {items.length > 100 ? <p className="muted">Mostrando 100 de {items.length}. CSV e JSON levam o lote inteiro.</p> : null}
          {id === 'mapa' ? <CoordinateMap key={items.slice(0, 8).map((item) => item.fields.map((field) => field.v).join('|')).join(';')} items={items.slice(0, 100)} /> : null}
        </section>
      ) : null}
    </div>
  )
}
