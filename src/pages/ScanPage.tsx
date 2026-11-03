import { useEffect, useRef, useState } from 'react'
import type { Verdict } from '../domain/inspect/verdict.ts'
import { readCode, relayAvailable, sendScan } from '../ui/scan.ts'
import { VALIDATORS } from '../ui/validators.ts'

type Read = { value: string; format: string; verdict: Verdict | null }

export function ScanPage({ query }: { query: URLSearchParams }) {
  const session = query.get('s') ?? ''
  const category = query.get('c') ?? ''
  const spec = VALIDATORS[category]
  const [reads, setReads] = useState<Read[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [miss, setMiss] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session) sendScan({ session, kind: 'hello' })
  }, [session])

  async function deliver(value: string, format: string) {
    sendScan({ session, kind: 'code', value, format })
    let result: Verdict | null = null
    if (spec && spec.input === 'text') {
      const outcome = await spec.run({ text: value, files: [] }, { ...spec.defaults }, new Date())
      result = outcome.verdicts[0] ?? null
    }
    setReads((current) => [{ value, format, verdict: result }, ...current])
  }

  async function photo(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    setMiss('')
    try {
      for (const file of Array.from(list)) {
        const found = await readCode(file).catch(() => null)
        if (found) await deliver(found.text, found.format)
        else setMiss('Não achei código nessa foto. Chegue mais perto, com o código reto e bem iluminado, ou digite abaixo.')
      }
    } finally {
      setBusy(false)
      if (camera.current) camera.current.value = ''
      if (gallery.current) gallery.current.value = ''
    }
  }

  if (!session) return <p className="banner bad">Link de leitura incompleto. Abra de novo pelo botão Escanear com o celular, no computador.</p>

  return (
    <div className="scan-page">
      <header className="scan-head">
        <h1>Leitor</h1>
        <p className={relayAvailable ? 'scan-status on' : 'scan-status'}>{relayAvailable ? 'Conectado: o que você ler aparece no computador.' : 'Sem conexão com o computador. O leitor só funciona com o npm run dev.'}</p>
      </header>
      <button type="button" className="primary scan-shoot" disabled={busy} onClick={() => camera.current?.click()}>{busy ? 'Lendo...' : 'Tirar foto do código'}</button>
      <button type="button" className="ghost" disabled={busy} onClick={() => gallery.current?.click()}>Escolher da galeria</button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => photo(event.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(event) => photo(event.target.files)} />
      {miss ? <p className="banner">{miss}</p> : null}
      <form className="scan-type" onSubmit={(event) => { event.preventDefault(); if (typed.trim()) { deliver(typed.trim(), 'Digitado'); setTyped('') } }}>
        <input inputMode="text" placeholder="Ou digite a linha digitável / o código" value={typed} onChange={(event) => setTyped(event.target.value)} />
        <button type="submit" className="ghost" disabled={!typed.trim()}>Enviar</button>
      </form>
      {reads.length ? <h2 className="scan-count">{reads.length} {reads.length === 1 ? 'leitura enviada' : 'leituras enviadas'}</h2> : null}
      <ul className="scan-reads">
        {reads.map((read, index) => (
          <li key={`${index}-${read.value}`} className={read.verdict ? `verdict ${read.verdict.tone}` : 'verdict'}>
            <header>
              {read.verdict ? <span className={`tone ${read.verdict.tone}`}>{read.verdict.title}</span> : null}
              <small>{read.format}</small>
            </header>
            <code>{read.value}</code>
            {read.verdict && read.verdict.tone !== 'ok' ? <p>{read.verdict.summary}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
