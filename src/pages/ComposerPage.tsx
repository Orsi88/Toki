import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CS, DEFAULT_COMPS, DOC_FIELDS } from '../domain/mfEngine.ts'
import { buildDocument, type DocComponent, type DocFormat, type DocMeta } from '../domain/documents.ts'
import { downloadBytes, downloadNotice, type Notice } from '../ui/browser.ts'
import { ClearButton } from '../ui/ClearButton.tsx'
import { FieldList, type EngineField } from '../ui/Fields.tsx'
import { optionIcon } from '../ui/optionIcon.ts'
import { TypePicker } from '../ui/TypePicker.tsx'

const FORMATS: DocFormat[] = ['Word', 'Excel', 'PowerPoint', 'PDF']
const FORMAT_HELP: Record<DocFormat, string> = { Word: 'Texto, tabelas e imagens.', Excel: 'Abas, fórmulas e gráficos.', PowerPoint: 'Slides com lista e gráfico.', PDF: 'Páginas com timbre.' }

const SECTION_HINTS: Record<string, string> = {
  cabecalho: 'Texto no topo de cada página.',
  titulo: 'Título principal do documento.',
  subtitulo: 'Linha de apoio abaixo do título.',
  paragrafo: 'Blocos de texto, com tamanho e estilo.',
  lista: 'Itens com marcadores ou numeração.',
  tabela: 'Linhas, colunas e cabeçalho.',
  imagem: 'Figura de exemplo, com legenda.',
  grafico: 'Barras, linhas ou pizza.',
  link: 'Texto ligado a um endereço.',
  comentario: 'Nota de revisão no arquivo.',
  formula: 'Funções de planilha.',
  quebra: 'Começa o conteúdo na página seguinte.',
  aba: 'Planilha com nome e tamanho.',
  slide: 'Quadro da apresentação.',
  rodape: 'Texto e numeração no fim da página.',
}

const componentsCatalog = CS as Record<string, { label: string; fmts: string[]; def?: Record<string, unknown>; fields: EngineField[] }>

function fresh(format: DocFormat): DocComponent[] {
  return (DEFAULT_COMPS[format] as [string, Record<string, unknown>?][]).map(([type, props], index) => ({
    id: `${type}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    props: { ...(componentsCatalog[type]?.def || {}), ...(props || {}) },
  }))
}

export function ComposerPage({
  format,
  onToast,
}: {
  format?: string
  onToast: (message: string | Notice, bad?: boolean) => void
}) {
  const initial = FORMATS.includes(format as DocFormat) ? format as DocFormat : 'Word'
  const [current, setCurrent] = useState<DocFormat>(initial)
  const [components, setComponents] = useState<DocComponent[]>(() => fresh(initial))
  const [meta, setMeta] = useState<Record<string, unknown>>({
    nome: 'documento_teste',
    titulo: 'Relatório de testes',
    autor: 'Toki',
    pagina: 'A4',
    orient: 'Retrato',
    conteudo: 'Normal',
    fmt: initial,
  })
  const [notes, setNotes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const catalog = Object.entries(componentsCatalog).filter(([, component]) => component.fmts.includes(current))

  useEffect(() => {
    if (!picking) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPicking(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picking])

  const metaFields = useMemo(
    () => (DOC_FIELDS as EngineField[]).map((field) => field),
    [],
  )

  function reset() {
    setComponents(fresh(current))
    setMeta({
      nome: 'documento_teste',
      titulo: 'Relatório de testes',
      autor: 'Toki',
      pagina: 'A4',
      orient: 'Retrato',
      conteudo: 'Normal',
      fmt: current,
    })
    setNotes([])
    setPicking(false)
    onToast('Configurações e prévia limpas.')
  }

  function changeFormat(next: DocFormat) {
    setCurrent(next)
    setMeta((value) => ({ ...value, fmt: next }))
    setComponents(fresh(next))
    setNotes([])
    setPicking(false)
  }

  function addComponent(type: string) {
    const spec = componentsCatalog[type]
    if (!spec) return
    setComponents((list) => [...list, { id: `${type}-${Date.now()}`, type, props: { ...(spec.def || {}) } }])
    setPicking(false)
  }

  function move(index: number, direction: -1 | 1) {
    setComponents((currentList) => {
      const target = index + direction
      if (target < 0 || target >= currentList.length) return currentList
      const copy = [...currentList]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  async function generate() {
    setBusy(true)
    try {
      let imagePng: Uint8Array | undefined
      if (components.some((component) => component.type === 'imagem')) {
        const response = await fetch('/golden-hour.png')
        if (!response.ok) throw new Error('Não foi possível carregar a imagem de exemplo.')
        imagePng = new Uint8Array(await response.arrayBuffer())
      }
      const built = await buildDocument({
        format: current,
        components,
        meta: meta as DocMeta,
        seed: Math.floor(Math.random() * 1_000_000_000),
        imagePng,
      })
      setNotes(built.notes)
      downloadBytes(built.filename, built.bytes, built.mime)
      onToast(downloadNotice(built.filename))
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Falha ao montar o documento.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="work">
      <ClearButton disabled={busy} onClick={reset} />
      <section className="step">
        <header className="step-title">
          <b>1</b>
          <div>
            <h2>Escolha o formato</h2>
            <p>Word e PDF saem com o timbre e a marca d’água. Excel e PowerPoint seguem o formato de cada um.</p>
          </div>
        </header>
        <TypePicker
          label="Formato do documento"
          value={current}
          options={FORMATS.map((item) => ({ value: item, label: item, desc: FORMAT_HELP[item], icon: optionIcon(item) }))}
          onChange={(value) => changeFormat(value as DocFormat)}
        />
      </section>
      <section className="step">
        <header className="step-title">
          <b>2</b>
          <div>
            <h2>Defina as propriedades do documento</h2>
            <p>Nome, metadados e página usados na geração.</p>
          </div>
        </header>
        <FieldList fields={metaFields} config={{ ...meta, fmt: current }} onChange={(name, value) => setMeta((currentMeta) => ({ ...currentMeta, [name]: value }))} />
      </section>
      <section className="step">
        <header className="step-title">
          <b>3</b>
          <div>
            <h2>Organize a estrutura dos componentes</h2>
            <p>A ordem da lista é a ordem do arquivo.</p>
          </div>
        </header>
        <div className="list">
          {components.map((component, index) => {
            const spec = componentsCatalog[component.type]
            return (
              <article key={component.id} className="card component-card">
                <div className="component-main">
                  <header className="step-title">
                    <b>{index + 1}</b>
                    <h3>{spec?.label || component.type}</h3>
                  </header>
                  {spec?.fields?.length ? (
                    <FieldList
                      fields={spec.fields}
                      config={component.props}
                      onChange={(name, value) => setComponents((list) => list.map((item) => item.id === component.id ? { ...item, props: { ...item.props, [name]: value } } : item))}
                    />
                  ) : null}
                </div>
                <div className="component-side">
                  <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 14l6-6 6 6" /></svg>
                  </button>
                  <button type="button" aria-label="Descer" disabled={index === components.length - 1} onClick={() => move(index, 1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 10l6 6 6-6" /></svg>
                  </button>
                  <button type="button" aria-label="Remover" onClick={() => setComponents((list) => list.filter((item) => item.id !== component.id))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" /></svg>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        <div className="add-section">
          <button type="button" className="ghost" aria-haspopup="dialog" aria-expanded={picking} onClick={() => setPicking(true)}>
            + SEÇÃO
          </button>
        </div>
        {picking ? createPortal(
          <div className="modal-back" onClick={() => setPicking(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-section-title" onClick={(event) => event.stopPropagation()}>
              <header className="modal-head">
                <div>
                  <h2 id="add-section-title">Escolha a seção</h2>
                  <p>Componentes disponíveis em {current}.</p>
                </div>
                <button type="button" aria-label="Fechar" onClick={() => setPicking(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </header>
              <div className="section-grid">
                {catalog.map(([type, component]) => (
                  <button key={type} type="button" onClick={() => addComponent(type)}>
                    <strong>{component.label}</strong>
                    <span>{SECTION_HINTS[type] || 'Entra no fim da estrutura.'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
        <button id="mf-generate" className="primary" type="button" disabled={busy} onClick={generate}>
          {busy ? 'Montando...' : 'Gerar documento'}
        </button>
      </section>
      <section className="panel" id="resultado">
        <h2>Revisão</h2>
        <p className="muted">{components.length} componente(s) em {current}. Esta página é a revisão do que entra no arquivo.</p>
        <article className={`doc-page ${current === 'PowerPoint' ? 'wide' : ''}`}>
          {components.length === 0 ? <p className="muted">Adicione um componente para ver a revisão.</p> : null}
          {components.map((component) => {
            const label = componentsCatalog[component.type]?.label || component.type
            const text = String(component.props.texto || component.props.nome || component.props.url || '')
            return (
              <div key={component.id} className={`doc-block ${component.type}`}>
                {component.type === 'titulo' || component.type === 'slide' ? <h3>{text || label}</h3> : null}
                {component.type === 'subtitulo' ? <h4>{text || label}</h4> : null}
                {component.type === 'paragrafo' ? <p>{text || 'Parágrafo de teste para importação.'}</p> : null}
                {component.type === 'lista' ? <ul><li>Item de teste 1</li><li>Item de teste 2</li><li>Item de teste 3</li></ul> : null}
                {component.type === 'tabela' || component.type === 'aba' || component.type === 'grafico' ? (
                  <table>
                    <thead><tr><th>Coluna 1</th><th>Coluna 2</th><th>Coluna 3</th></tr></thead>
                    <tbody><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>E</td><td>F</td></tr></tbody>
                  </table>
                ) : null}
                {component.type === 'imagem' ? <div className="doc-image">Imagem de exemplo</div> : null}
                {component.type === 'formula' ? <p className="mono">{text || String(component.props.func || 'Fórmula')}</p> : null}
                {component.type === 'cabecalho' || component.type === 'rodape' || component.type === 'comentario' || component.type === 'link' || component.type === 'quebra' ? (
                  <p className="muted">{label}{text ? ` — ${text}` : ''}</p>
                ) : null}
              </div>
            )
          })}
        </article>
        {notes.map((note) => <p key={note} className="banner">{note}</p>)}
      </section>
    </div>
  )
}
