import { useEffect, useMemo, useState } from 'react'
import { recordsToCsv, recordsToJson, type GeneratedItem } from '../domain/export.ts'
import {
  EVENT_AREAS, EVENT_DEFAULTS, EVENT_KINDS, EVENT_RULES, ROLES, TICKET_TYPES,
  eventBatch, eventRows, eventsPdf, fieldOf, qrImagesZip, type EventConfig, type EventKind, type EventRow, type Sector,
} from '../domain/events.ts'
import { encodePng } from '../domain/media.ts'
import { rng, setReferenceDate } from '../domain/mfEngine.ts'
import { qrRaster } from '../domain/symbols.ts'
import { copyText, downloadBlob, downloadBytes, downloadNotice, downloadText, type Notice } from '../ui/browser.ts'
import { ClearButton } from '../ui/ClearButton.tsx'
import { EventPass } from '../ui/EventPass.tsx'
import { FieldList, type EngineField } from '../ui/Fields.tsx'
import { TypePicker } from '../ui/TypePicker.tsx'

type Config = Record<string, unknown>

const LIMIT = 1000

function inputDate(offset: number) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaults(tipo: EventKind): Config {
  return {
    tipo,
    modo: 'Um',
    regra: EVENT_RULES[tipo][0],
    regras: [EVENT_RULES[tipo][0]],
    qtd: 20,
    nomeEvento: EVENT_DEFAULTS.nomeEvento,
    evento: EVENT_DEFAULTS.evento,
    data: inputDate(30),
    horario: EVENT_DEFAULTS.horario,
    local: EVENT_DEFAULTS.local,
    cidade: EVENT_DEFAULTS.cidade,
    organizador: EVENT_DEFAULTS.organizador,
    tiposIngresso: [...EVENT_DEFAULTS.tiposIngresso],
    titular: '',
    assento: true,
    funcoes: [...EVENT_DEFAULTS.funcoes],
    area: 'Backstage',
    categorias: EVENT_DEFAULTS.categorias.join(', '),
    valorInscricao: EVENT_DEFAULTS.valorInscricao,
    idadeMin: 18,
    prefixo: '',
    desconto: 10,
    limite: EVENT_DEFAULTS.limite,
    inicio: inputDate(-7),
    fim: inputDate(60),
  }
}

const KIND_FIELDS: EngineField[] = [
  {
    k: 'modo', label: 'Quantidade', type: 'seg', opts: ['Um', 'Em massa'],
    help: (config) => config.modo === 'Um' ? 'Um item com visualização ao vivo. Gerar outro sorteia de novo.' : 'Um lote com a lista; clique em um item para ver como ele fica.',
  },
]

const TYPE_FIELDS: EngineField[] = [
  { k: 'tiposIngresso', label: 'Tipos de ingresso', type: 'chips', opts: TICKET_TYPES, show: (config) => config.tipo === 'Ingresso' },
  { k: 'assento', label: 'Assento numerado', type: 'tog', show: (config) => config.tipo === 'Ingresso', help: 'Pista nunca tem assento.' },
  { k: 'funcoes', label: 'Funções', type: 'chips', opts: Object.keys(ROLES), show: (config) => config.tipo === 'Credencial' },
  { k: 'area', label: 'Área conferida na portaria', type: 'sel', opts: EVENT_AREAS, show: (config) => config.tipo === 'Credencial', help: 'Área não autorizada gera uma credencial sem ela.' },
  { k: 'categorias', label: 'Categorias (separadas por vírgula)', type: 'txt', show: (config) => config.tipo === 'Inscrição' },
  { k: 'valorInscricao', label: 'Valor da inscrição (R$)', type: 'num', show: (config) => config.tipo === 'Inscrição', help: 'Zero deixa a inscrição isenta.' },
  { k: 'idadeMin', label: 'Idade mínima', type: 'num', show: (config) => config.tipo === 'Inscrição', presets: [0, 16, 18] },
  { k: 'prefixo', label: 'Prefixo do cupom', type: 'txt', show: (config) => config.tipo === 'Cupom', help: 'Vazio usa o começo do código do evento.' },
  { k: 'desconto', label: 'Desconto (%)', type: 'num', show: (config) => config.tipo === 'Cupom', presets: [5, 10, 20, 50] },
  { k: 'limite', label: 'Limite de usos', type: 'num', show: (config) => config.tipo === 'Cupom', presets: [10, 100, 500] },
  { k: 'titular', label: (config) => config.tipo === 'Credencial' ? 'Nome na credencial' : config.tipo === 'Inscrição' ? 'Nome do inscrito' : 'Titular', type: 'txt', show: (config) => config.tipo !== 'Cupom', help: 'Vazio sorteia um nome diferente para cada item.' },
]

function ruleFields(tipo: EventKind): EngineField[] {
  return [
    { k: 'regra', label: 'Regra', type: 'sel', opts: EVENT_RULES[tipo], show: (config) => config.modo === 'Um' },
    { k: 'regras', label: 'Regras no lote', type: 'chips', opts: EVENT_RULES[tipo], show: (config) => config.modo !== 'Um', help: 'As regras marcadas se revezam: 20 itens com 2 regras dão 10 de cada.' },
    { k: 'qtd', label: 'Quantidade', type: 'num', show: (config) => config.modo !== 'Um', presets: [10, 50, 100, 500] },
  ]
}

function toConfig(config: Config, sectors: Sector[]): Omit<EventConfig, 'regra'> {
  return {
    tipo: config.tipo as EventKind,
    evento: String(config.evento || '').trim() || EVENT_DEFAULTS.evento,
    nomeEvento: String(config.nomeEvento || ''),
    area: String(config.area || 'Geral'),
    idadeMin: Number(config.idadeMin) || 0,
    data: String(config.data || ''),
    horario: String(config.horario || ''),
    local: String(config.local ?? ''),
    cidade: String(config.cidade ?? ''),
    organizador: String(config.organizador ?? ''),
    setores: sectors,
    tiposIngresso: config.tiposIngresso as string[],
    titular: String(config.titular || ''),
    assento: Boolean(config.assento),
    funcoes: config.funcoes as string[],
    categorias: String(config.categorias || '').split(',').map((item) => item.trim()).filter(Boolean),
    valorInscricao: Number(config.valorInscricao) || 0,
    prefixo: String(config.prefixo || ''),
    desconto: Number(config.desconto) || 0,
    limite: Number(config.limite) || 0,
    inicio: String(config.inicio || ''),
    fim: String(config.fim || ''),
  }
}

function problem(config: Config, sectors: Sector[]) {
  if (config.tipo === 'Ingresso') {
    if (!sectors.some((sector) => sector.nome.trim())) return 'Informe ao menos um setor.'
    if (sectors.some((sector) => !Number.isFinite(sector.preco) || sector.preco < 0)) return 'O preço de cada setor precisa ser um número maior ou igual a zero.'
    if (!(config.tiposIngresso as string[]).length) return 'Marque ao menos um tipo de ingresso.'
  }
  if (config.tipo === 'Credencial' && !(config.funcoes as string[]).length) return 'Marque ao menos uma função.'
  if (config.tipo === 'Cupom') {
    const percent = Number(config.desconto)
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) return 'O desconto precisa ficar entre 1% e 100%.'
    if (!Number.isInteger(Number(config.limite)) || Number(config.limite) < 1) return 'O limite de usos precisa ser um inteiro a partir de 1.'
    if (config.inicio && config.fim && String(config.inicio) > String(config.fim)) return 'O início da vigência está depois do fim.'
  }
  if (config.modo !== 'Um') {
    const count = Number(config.qtd)
    if (!Number.isInteger(count) || count < 1 || count > LIMIT) return `A quantidade precisa ser um inteiro de 1 a ${LIMIT}.`
    if (!(config.regras as string[]).length) return 'Marque ao menos uma regra para o lote.'
  }
  return ''
}

function asItems(rows: EventRow[]): GeneratedItem[] {
  return rows.map((item) => ({ tag: item.tag, tone: item.tone, rule: item.rule, checks: [[item.tag, item.tone]], fields: item.fields.map(([k, key, v]) => ({ k, key, v })) }))
}

function qrPngBytes(value: string) {
  const raster = qrRaster(value, 4, 'M', 8)
  return encodePng(new Uint8Array(raster.data.buffer), raster.width, raster.height, true)
}

const fileStem = (item: EventRow) => (fieldOf(item, 'codigo') || fieldOf(item, 'cupom') || fieldOf(item, 'inscricao') || 'item').replace(/[^\w.-]+/g, '_')

export function EventsPage({ query, onToast }: { query: URLSearchParams; onToast: (message: string | Notice, bad?: boolean) => void }) {
  const initialTipo = EVENT_KINDS.includes(query.get('tipo') as EventKind) ? query.get('tipo') as EventKind : 'Ingresso'
  const [config, setConfig] = useState<Config>(() => defaults(initialTipo))
  const [sectors, setSectors] = useState<Sector[]>(() => EVENT_DEFAULTS.setores.map((sector) => ({ ...sector })))
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [today] = useState(() => new Date())
  const [batch, setBatch] = useState<EventRow[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const tipo = config.tipo as EventKind
  const single = config.modo === 'Um'
  const error = problem(config, sectors)

  useEffect(() => {
    const next = `#/eventos?tipo=${encodeURIComponent(tipo)}`
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [tipo])

  const preview = useMemo(() => {
    if (!single || error) return []
    setReferenceDate(today)
    return eventRows({ ...toConfig(config, sectors), regra: String(config.regra) } as EventConfig, rng(seed))
  }, [config, error, seed, sectors, single, today])

  function update(name: string, value: unknown) {
    setConfig((current) => {
      if (name !== 'tipo') return { ...current, [name]: value }
      const kind = value as EventKind
      return { ...current, tipo: kind, regra: EVENT_RULES[kind][0], regras: [EVENT_RULES[kind][0]] }
    })
    setBatch(null)
    setOpen(null)
  }

  function generateBatch() {
    if (error) return
    setReferenceDate(new Date())
    const rows = eventBatch(toConfig(config, sectors), config.regras as string[], Number(config.qtd), rng(Math.floor(Math.random() * 1_000_000_000)))
    setBatch(rows)
    setOpen(null)
    document.getElementById('resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function copy(value: string, what = 'Copiado.') {
    const done = await copyText(value)
    onToast(done ? what : 'Não foi possível copiar.', !done)
  }

  async function pdf(rows: EventRow[], name: string) {
    downloadBytes(name, await eventsPdf(rows, tipo), 'application/pdf')
    onToast(downloadNotice(name))
  }

  function reset() {
    setConfig(defaults(tipo))
    setSectors(EVENT_DEFAULTS.setores.map((sector) => ({ ...sector })))
    setBatch(null)
    setOpen(null)
    onToast('Configurações limpas.')
  }

  const viewing = open !== null && batch ? batch[open] : null
  const shown = single ? preview : batch ?? []
  const counts = useMemo(() => {
    const map = new Map<string, { tone: string; count: number }>()
    for (const item of batch ?? []) map.set(item.tag, { tone: item.tone, count: (map.get(item.tag)?.count ?? 0) + 1 })
    return [...map]
  }, [batch])

  return (
    <div className="work">
      <ClearButton onClick={reset} />
      <section className="step">
        <header className="step-title"><b>1</b><div><h2>O que gerar</h2><p>Escolha o tipo e se quer um item ou um lote.</p></div></header>
        <TypePicker
          label="Tipo"
          options={[
            { value: 'Ingresso', label: 'Ingresso', desc: 'E-ticket com QR, setor e preço.', icon: 'ingresso' },
            { value: 'Credencial', label: 'Credencial', desc: 'Crachá com função e áreas.', icon: 'credencial' },
            { value: 'Inscrição', label: 'Inscrição', desc: 'Ficha com CPF, idade e pagamento.', icon: 'inscricao' },
            { value: 'Cupom', label: 'Cupom', desc: 'Desconto com vigência e usos.', icon: 'cupom' },
          ]}
          value={tipo}
          onChange={(value) => update('tipo', value)}
        />
        <FieldList fields={KIND_FIELDS} config={config} onChange={update} />
      </section>

      <section className="step">
        <header className="step-title"><b>2</b><div><h2>O evento</h2><p>Os dados aparecem no ingresso. O código do evento vai dentro do QR e é conferido na aba Validar.</p></div></header>
        <div className="fields">
          <label className="field"><span>Nome do evento</span><input value={String(config.nomeEvento)} onChange={(event) => update('nomeEvento', event.target.value)} /></label>
          <label className="field"><span>Código do evento</span><input value={String(config.evento)} onChange={(event) => update('evento', event.target.value.toUpperCase())} /></label>
          {tipo !== 'Cupom' ? (
            <>
              <label className="field"><span>{tipo === 'Credencial' ? 'Credencial válida até' : 'Data do evento'}</span><input type="date" value={String(config.data)} onChange={(event) => update('data', event.target.value)} /></label>
              {tipo === 'Ingresso' ? <label className="field"><span>Horário</span><input type="time" value={String(config.horario)} onChange={(event) => update('horario', event.target.value)} /></label> : null}
            </>
          ) : (
            <>
              <label className="field"><span>Vigência: início</span><input type="date" value={String(config.inicio)} onChange={(event) => update('inicio', event.target.value)} /></label>
              <label className="field"><span>Vigência: fim</span><input type="date" value={String(config.fim)} onChange={(event) => update('fim', event.target.value)} /></label>
            </>
          )}
          {tipo === 'Ingresso' ? (
            <>
              <label className="field"><span>Local</span><input value={String(config.local)} onChange={(event) => update('local', event.target.value)} /></label>
              <label className="field"><span>Cidade</span><input value={String(config.cidade)} onChange={(event) => update('cidade', event.target.value)} /></label>
              <label className="field"><span>Organizador</span><input value={String(config.organizador)} onChange={(event) => update('organizador', event.target.value)} /></label>
            </>
          ) : null}
        </div>
      </section>

      <section className="step">
        <header className="step-title"><b>3</b><div><h2>{{ Ingresso: 'Setores, tipos e titular', Credencial: 'Funções, área e nome', Inscrição: 'Categorias, valor e idade', Cupom: 'Desconto e usos' }[tipo]}</h2><p>Tudo que ficar vazio é sorteado.</p></div></header>
        {tipo === 'Ingresso' ? (
          <div className="sector-list">
            <span className="sector-head">Setores e preço da inteira</span>
            {sectors.map((sector, index) => (
              <div key={index} className="sector-row">
                <input aria-label="Nome do setor" value={sector.nome} onChange={(event) => { const next = [...sectors]; next[index] = { ...sector, nome: event.target.value }; setSectors(next); setBatch(null) }} />
                <label className="money"><span>R$</span><input aria-label="Preço" type="number" min="0" step="0.01" value={Number.isFinite(sector.preco) ? sector.preco : ''} onChange={(event) => { const next = [...sectors]; next[index] = { ...sector, preco: event.target.value === '' ? Number.NaN : Number(event.target.value) }; setSectors(next); setBatch(null) }} /></label>
                <button type="button" className="ghost" aria-label={`Tirar ${sector.nome}`} disabled={sectors.length === 1} onClick={() => { setSectors(sectors.filter((_, at) => at !== index)); setBatch(null) }}>×</button>
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setSectors([...sectors, { nome: `Setor ${sectors.length + 1}`, preco: 100 }])}>+ Adicionar setor</button>
            <p className="muted">Meia sai pela metade do preço e cortesia sai a R$ 0,00.</p>
          </div>
        ) : null}
        <FieldList fields={TYPE_FIELDS} config={config} onChange={update} />
      </section>

      <section className="step">
        <header className="step-title"><b>4</b><div><h2>{single ? 'A regra' : 'As regras e o tamanho do lote'}</h2><p>Válido, ou um caso negativo explícito para testar a portaria.</p></div></header>
        <FieldList fields={ruleFields(tipo)} config={config} onChange={update} />
        {error ? <p className="banner bad">{error}</p> : null}
        {single ? (
          <button id="mf-generate" className="primary" type="button" disabled={Boolean(error)} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}>Gerar outro</button>
        ) : (
          <button id="mf-generate" className="primary" type="button" disabled={Boolean(error)} onClick={generateBatch}>Gerar lote</button>
        )}
      </section>

      <section className="panel" id="resultado">
        <header className="preview-head"><h2>{single ? 'Visualização' : batch ? `Lote com ${batch.length} ${batch.length === 1 ? 'item' : 'itens'}` : 'Lote'}</h2></header>
        {single && preview.map((item, index) => (
          <ItemView key={index} item={item} tipo={tipo} onCopy={copy} onPdf={() => pdf([item], `${fileStem(item)}.pdf`)} />
        ))}
        {!single && !batch ? <p className="muted">Defina as regras e clique em Gerar lote. Cada item da lista abre o visualizador.</p> : null}
        {!single && batch ? (
          <>
            <p className="verdict-count">{counts.map(([tag, info]) => <span key={tag} className={`tone ${info.tone}`}>{info.count} · {tag}</span>)}</p>
            <div className="event-list" role="list">
              {batch.map((item, index) => (
                <button key={index} type="button" role="listitem" className="event-row" onClick={() => setOpen(index)}>
                  <code>{fieldOf(item, 'codigo') || fieldOf(item, 'cupom') || fieldOf(item, 'inscricao')}</code>
                  <span>{fieldOf(item, 'titular') || fieldOf(item, 'nome') || fieldOf(item, 'desconto') || '(sem nome)'}</span>
                  <span className="muted">{fieldOf(item, 'setor') || fieldOf(item, 'funcao') || fieldOf(item, 'categoria') || `${fieldOf(item, 'inicio')} a ${fieldOf(item, 'fim')}`}</span>
                  <span className={`tone ${item.tone}`}>{item.tag}</span>
                  <span className="event-open">Ver →</span>
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => { downloadText('eventos.csv', recordsToCsv(asItems(batch)), 'text/csv;charset=utf-8'); onToast(downloadNotice('eventos.csv')) }}>Baixar CSV</button>
              <button type="button" onClick={() => { downloadText('eventos.json', recordsToJson(asItems(batch)), 'application/json'); onToast(downloadNotice('eventos.json')) }}>Baixar JSON</button>
              <button type="button" onClick={() => pdf(batch, 'eventos.pdf')}>Baixar PDF (1 por página)</button>
              {tipo !== 'Inscrição' ? (
                <button type="button" className="download" onClick={async () => {
                  downloadBlob('qr-codes.zip', await qrImagesZip(batch.map((item) => ({ name: fileStem(item), qr: fieldOf(item, 'qr') }))))
                  onToast(downloadNotice('qr-codes.zip'))
                }}>Baixar os QR Codes (PNG)</button>
              ) : null}
            </div>
          </>
        ) : null}
        {shown.length === 0 && single && error ? <p className="muted">Corrija a configuração para ver o item.</p> : null}
      </section>

      {viewing && batch ? (
        <div className="viewer" role="dialog" aria-modal="true" aria-label="Visualizar item" onClick={() => setOpen(null)}>
          <div className="viewer-card" onClick={(event) => event.stopPropagation()}>
            <header className="preview-head">
              <h2>Item {(open ?? 0) + 1} de {batch.length}</h2>
              <div className="viewer-nav">
                <button type="button" className="ghost" disabled={!open} onClick={() => setOpen((open ?? 1) - 1)}>← Anterior</button>
                <button type="button" className="ghost" disabled={open === batch.length - 1} onClick={() => setOpen((open ?? 0) + 1)}>Próximo →</button>
                <button type="button" className="ghost" aria-label="Fechar" onClick={() => setOpen(null)}>✕</button>
              </div>
            </header>
            <ItemView item={viewing} tipo={tipo} onCopy={copy} onPdf={() => pdf([viewing], `${fileStem(viewing)}.pdf`)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ItemView({ item, tipo, onCopy, onPdf }: { item: EventRow; tipo: EventKind; onCopy: (value: string, what?: string) => void; onPdf: () => void }) {
  const qr = fieldOf(item, 'qr')
  return (
    <div className="item-view">
      <EventPass item={item} tipo={tipo} />
      <p><span className={`tone ${item.tone}`}>{item.tag}</span> <span className="muted">{item.why}</span></p>
      {qr ? (
        <div className="qr-content">
          <span>Conteúdo do QR</span>
          <code>{qr}</code>
        </div>
      ) : null}
      <div className="row-actions">
        {qr ? <button type="button" onClick={() => onCopy(qr, 'Conteúdo do QR copiado. Cole na aba Validar para conferir.')}>Copiar conteúdo do QR</button> : null}
        {qr ? <button type="button" onClick={() => downloadBytes(`${fileStem(item)}-qr.png`, qrPngBytes(qr), 'image/png')}>Baixar QR (PNG)</button> : null}
        <button type="button" onClick={onPdf}>Baixar PDF</button>
      </div>
      <details className="adv-box">
        <summary>Todos os campos</summary>
        <div className="stack">
          {item.fields.filter(([, key]) => key !== 'qr').map(([label, key, value]) => (
            <div key={key} className="copy-row"><span>{label}</span><strong>{value || '(vazio)'}</strong></div>
          ))}
        </div>
      </details>
    </div>
  )
}
