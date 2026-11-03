import { useEffect, useRef, useState } from 'react'
import type { InFile } from '../domain/inspect/files.ts'
import type { Verdict } from '../domain/inspect/verdict.ts'
import { downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { ClearButton } from '../ui/ClearButton.tsx'
import { FieldList } from '../ui/Fields.tsx'
import { ActionIcon } from '../ui/Icons.tsx'
import { TypePicker } from '../ui/TypePicker.tsx'
import { ScanDialog } from '../ui/ScanDialog.tsx'
import { listenScan, readCode } from '../ui/scan.ts'
import { VALIDATORS } from '../ui/validators.ts'

type Config = Record<string, unknown>

function todayInput() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function initialConfig(id: string, query: URLSearchParams) {
  const spec = VALIDATORS[id]
  const config: Config = { ...spec.defaults }
  for (const [name, value] of query) if (name in config && typeof config[name] === 'string') config[name] = value
  return config
}

function reportCsv(verdicts: Verdict[]) {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
  const rows = [['entrada', 'resultado', 'resumo', 'conferencias'].map(cell).join(',')]
  for (const item of verdicts) rows.push([item.input, item.title, item.summary, item.checks.map((check) => `${check.label}: ${check.detail}`).join(' | ')].map(cell).join(','))
  return `\ufeff${rows.join('\r\n')}`
}

const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1).replace('.', ',')} KB` : `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`

export function ValidatePage({ id, query, onToast }: { id: string; query: URLSearchParams; onToast: (message: string | Notice, bad?: boolean) => void }) {
  const spec = VALIDATORS[id]
  const [config, setConfig] = useState<Config>(() => initialConfig(id, query))
  const [day, setDay] = useState(todayInput)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<InFile[]>([])
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [dragging, setDragging] = useState(false)
  const [session, setSession] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [phone, setPhone] = useState({ connected: false, received: 0 })
  const picker = useRef<HTMLInputElement>(null)
  const images = useRef<HTMLInputElement>(null)
  const fileMode = spec.input === 'files'
  const ready = fileMode ? files.length > 0 : text.trim().length > 0 || (id === 'borda' && text.length > 0)

  // Enquanto houver uma sessão aberta, o que o celular ler entra na caixa, um por linha.
  useEffect(() => {
    if (!session) return
    return listenScan(session, (message) => {
      if (message.kind === 'hello') setPhone((current) => ({ ...current, connected: true }))
      if (message.kind === 'code' && message.value) {
        const value = message.value
        setPhone((current) => ({ connected: true, received: current.received + 1 }))
        setText((current) => [current.trim(), value].filter(Boolean).join('\n'))
        setVerdicts(null)
        onToast({ title: 'Lido no celular', detail: `${message.format ?? 'Código'}: ${value.length > 48 ? `${value.slice(0, 48)}…` : value}` })
      }
    })
  }, [session, onToast])

  function openScan() {
    if (!session) setSession(Math.random().toString(36).slice(2, 10))
    setScanOpen(true)
  }

  function stale() {
    setVerdicts(null)
    setError('')
  }

  function update(name: string, value: unknown) {
    setConfig((current) => ({ ...current, [name]: value }))
    stale()
  }

  async function run() {
    setBusy('Validando...')
    try {
      const result = await spec.run({ text, files }, config, new Date(`${day}T12:00:00`))
      setError(result.error ?? '')
      setVerdicts(result.error ? null : result.verdicts)
      if (!result.error) document.getElementById('resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao validar.')
    } finally {
      setBusy('')
    }
  }

  async function examples() {
    setBusy('Gerando exemplos...')
    try {
      const sample = await spec.examples(config, new Date(`${day}T12:00:00`))
      if (sample.text !== undefined) setText(sample.text)
      if (sample.files) setFiles(sample.files)
      stale()
    } finally {
      setBusy('')
    }
  }

  async function addFiles(list: FileList | File[] | null) {
    if (!list || !list.length) return
    setBusy('Lendo arquivos...')
    try {
      const read = await Promise.all(Array.from(list).map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
      setFiles((current) => [...current, ...read])
      stale()
    } finally {
      setBusy('')
      if (picker.current) picker.current.value = ''
    }
  }

  async function addTextFile(list: FileList | null) {
    if (!list?.length) return
    setText(await list[0].text())
    stale()
    if (picker.current) picker.current.value = ''
  }

  async function readImages(list: FileList | null) {
    if (!list?.length) return
    setBusy('Lendo QR Codes...')
    try {
      const found: string[] = []
      const missed: string[] = []
      for (const file of Array.from(list)) {
        const value = await readCode(file).catch(() => null)
        if (value) found.push(value.text)
        else missed.push(file.name)
      }
      if (found.length) setText((current) => [current.trim(), ...found].filter(Boolean).join('\n'))
      if (missed.length) onToast({ title: 'Código não encontrado', detail: `Não foi possível ler: ${missed.join(', ')}.`, bad: true })
      else onToast(`${found.length} ${found.length === 1 ? 'código lido' : 'códigos lidos'}.`)
      stale()
    } finally {
      setBusy('')
      if (images.current) images.current.value = ''
    }
  }

  function reset() {
    setConfig(initialConfig(id, query))
    setDay(todayInput())
    setText('')
    setFiles([])
    stale()
    onToast('Configurações e conferência limpas.')
  }

  const counts = verdicts ? (['ok', 'warn', 'bad'] as const).map((tone) => [tone, verdicts.filter((item) => item.tone === tone).length] as const) : []
  let step = 0

  return (
    <div className="work">
      <ClearButton onClick={reset} />
      <p className="validate-intro">{spec.intro}</p>
      {spec.picker || spec.fields.length || spec.usesDate ? (
        <section className="step">
          <header className="step-title"><b>{++step}</b><div><h2>Defina a conferência</h2><p>O que for deixado vazio não é conferido.</p></div></header>
          {spec.picker ? <TypePicker label={spec.picker.label} options={spec.picker.options} value={String(config[spec.picker.key])} onChange={(value) => update(spec.picker!.key, value)} /> : null}
          {spec.fields.length ? <FieldList fields={spec.fields} config={config} onChange={update} /> : null}
          {spec.usesDate ? (
            <div className="fields">
              <label className="field"><span>{spec.usesDate}</span><input type="date" value={day} onChange={(event) => { setDay(event.target.value); stale() }} /></label>
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="step">
        <header className="step-title"><b>{++step}</b><div><h2>{spec.heading(config)}</h2><p>{spec.hint(config)}</p></div></header>
        {fileMode ? (
          <div
            className={dragging ? 'dropzone over' : 'dropzone'}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}
          >
            {files.length ? (
              <ul className="file-chips">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <small>{size(file.bytes.length)}</small>
                    <button type="button" className="chip-remove" aria-label={`Tirar ${file.name}`} title="Tirar da lista" onClick={() => { setFiles(files.filter((_, at) => at !== index)); stale() }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p>Arraste os arquivos para cá ou use o botão abaixo.</p>}
          </div>
        ) : (
          <textarea
            className="code"
            aria-label={spec.heading(config)}
            placeholder={spec.placeholder?.(config) ?? 'Um valor por linha'}
            value={text}
            onChange={(event) => { setText(event.target.value); stale() }}
          />
        )}
        <div className="tool-actions">
          <button type="button" disabled={Boolean(busy)} title="Casos bons e ruins para ver o que cada conferência pega" onClick={examples}><ActionIcon name="examples" />Exemplos</button>
          {fileMode ? <button type="button" disabled={Boolean(busy)} onClick={() => picker.current?.click()}><ActionIcon name="upload" />Escolher arquivos</button> : null}
          {!fileMode && spec.accept ? <button type="button" disabled={Boolean(busy)} onClick={() => picker.current?.click()}><ActionIcon name="upload" />Enviar arquivo</button> : null}
          {!fileMode && spec.qrImages ? <button type="button" disabled={Boolean(busy)} title="Lê QR Code ou código de barras de uma foto" onClick={() => images.current?.click()}><ActionIcon name="image" />Ler imagem</button> : null}
          {!fileMode && spec.qrImages ? <button type="button" disabled={Boolean(busy)} onClick={openScan}><ActionIcon name="phone" />Escanear com o celular</button> : null}
          <button type="button" disabled={fileMode ? !files.length : !text} onClick={() => { setText(''); setFiles([]); stale() }}><ActionIcon name="clear" />Limpar</button>
        </div>
        <input ref={picker} type="file" hidden multiple={fileMode} accept={fileMode ? undefined : spec.accept} onChange={(event) => (fileMode ? addFiles(event.target.files) : addTextFile(event.target.files))} />
        <input ref={images} type="file" hidden multiple accept="image/*" onChange={(event) => readImages(event.target.files)} />
        {session && !scanOpen ? (
          <p className={phone.connected ? 'scan-status on' : 'scan-status'}>
            {phone.connected ? `Celular conectado · ${phone.received} ${phone.received === 1 ? 'leitura recebida' : 'leituras recebidas'}` : 'Aguardando o celular abrir a página de leitura.'}
            {' '}<button type="button" className="textish" onClick={() => setScanOpen(true)}>Mostrar QR e link</button>
          </p>
        ) : null}
        {error ? <p className="banner bad">{error}</p> : null}
        <button id="mf-generate" className="primary" type="button" disabled={!ready || Boolean(busy)} onClick={run}>{busy || 'Validar'}</button>
      </section>
      {scanOpen && session ? <ScanDialog session={session} category={id} connected={phone.connected} received={phone.received} onClose={() => setScanOpen(false)} /> : null}
      <section className="panel" id="resultado">
        <header className="preview-head"><h2>Resultado</h2></header>
        {!verdicts ? <p className="muted">{fileMode ? 'Envie arquivos' : 'Cole os valores'} e clique em Validar. O botão Exemplos traz casos bons e ruins para ver o que cada conferência pega.</p> : null}
        {verdicts ? (
          <p className="verdict-count">
            {counts.map(([tone, count]) => count || tone !== 'warn' ? <span key={tone} className={`tone ${tone}`}>{count} {fileMode ? (tone === 'ok' ? 'sem observações' : tone === 'warn' ? 'com observações' : 'pedem atenção') : tone === 'ok' ? (count === 1 ? 'aprovado' : 'aprovados') : tone === 'warn' ? 'com alerta' : count === 1 ? 'reprovado' : 'reprovados'}</span> : null)}
          </p>
        ) : null}
        {verdicts?.map((item, index) => (
          <article key={`${index}-${item.input}`} className={`verdict ${item.tone}`}>
            <header>
              <span className={`tone ${item.tone}`}>{item.title}</span>
              <code title={item.input}>{item.input}</code>
            </header>
            <p>{item.summary}</p>
            <ul>
              {item.checks.map((check, at) => (
                <li key={`${check.label}-${at}`} className={check.tone}>
                  <strong>{check.label}</strong>
                  <span>{/^https:\/\/www\.openstreetmap\.org\//.test(check.detail) ? <a href={check.detail} target="_blank" rel="noreferrer">Abrir no mapa</a> : check.detail}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {verdicts?.length ? (
          <div className="row-actions">
            <button type="button" className="download" onClick={() => { downloadText('conferencia.csv', reportCsv(verdicts), 'text/csv;charset=utf-8'); onToast(downloadNotice('conferencia.csv')) }}>Baixar relatório CSV</button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
