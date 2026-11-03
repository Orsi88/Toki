import { useEffect, useMemo, useRef, useState } from 'react'
import { CATS, ENG, FAM } from './domain/mfEngine.ts'
import { STRATEGIES, type StrategyId } from './domain/strategy/index.ts'
import type { Notice } from './ui/browser.ts'
import { ComposerPage } from './pages/ComposerPage.tsx'
import { CustomPage } from './pages/CustomPage.tsx'
import { FilesPage } from './pages/FilesPage.tsx'
import { GeneratorPage } from './pages/GeneratorPage.tsx'
import { CategoryIcon } from './ui/Icons.tsx'
import { SearchField } from './ui/SearchField.tsx'
import { StrategyChooser, StrategyPage } from './pages/StrategyPage.tsx'
import { EventsPage } from './pages/EventsPage.tsx'
import { FinancePage } from './pages/FinancePage.tsx'
import { FINANCE_KINDS } from './ui/finance.ts'
import { ScanPage } from './pages/ScanPage.tsx'
import { ValidatePage } from './pages/ValidatePage.tsx'
import { VALIDATORS } from './ui/validators.ts'

type Card = {
  name: string
  eng?: string
  desc?: string
  kw?: string
  soon?: number
  preset?: Record<string, string>
}
type Category = { id: string; name: string; desc: string; icon?: string; count?: string; direct?: boolean; cards: Card[] }

// Texto curto dos cards da tela inicial; a descrição completa aparece dentro da categoria.
const SHORT: Record<string, string> = {
  arquivos: 'Qualquer extensão, tamanho e conteúdo para testar upload.',
  documentos: 'Word, Excel, PowerPoint e PDF sob medida.',
  textos: 'Tamanho exato, acentos, emojis e símbolos.',
  pessoais: 'CPF, CNPJ, e-mail, telefone e endereço.',
  numeros: 'Inteiros, decimais, moedas, cores e medidas.',
  financeiro: 'Cartões, PIX e boletos.',
  estruturados: 'JSON, XML, CSV, SQL, QR e código de barras.',
  datas: 'Datas, horários, fusos e timestamps.',
  borda: 'Limites, nulos, extremos e injeção.',
  mapas: 'Coordenadas e áreas, dentro ou fora do mapa.',
  eventos: 'Ingressos, credenciais, inscrições e cupons com QR.',
  combinadas: 'Suas colunas e regras, em CSV ou JSON.',
}

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
}

function scrollHome() {
  const hero = document.querySelector('.hero')
  if (!(hero instanceof HTMLElement)) return
  window.scrollTo({ top: hero.offsetTop + hero.offsetHeight, behavior: 'smooth' })
}

function cardHref(card: Card) {
  if (!card.eng || card.soon) return ''
  if (card.eng === 'files') return '#/files'
  if (card.eng === 'composer') return '#/docs'
  if (card.eng === 'combinadas') return '#/massa'
  if (card.eng === 'eventos') return '#/eventos'
  if (card.eng === 'financeiro') return '#/financeiro'
  const query = card.preset ? `?${new URLSearchParams(card.preset).toString()}` : ''
  return `#/g/${card.eng}${query}`
}

// Entre os cards do mesmo gerador, fica com o que tem o preset da URL.
function cardFor(categories: Category[], id: string, query: URLSearchParams) {
  const cards = categories.flatMap((category) => category.cards).filter((card) => card.eng === id)
  return cards.find((card) => card.preset && Object.entries(card.preset).every(([name, value]) => query.get(name) === value)) ?? cards[0]
}

function categoryHref(category: Category) {
  const active = category.cards.filter((card) => !card.soon)
  if (category.direct || active.length === 1) return cardHref(active[0])
  return `#/c/${category.id}`
}

function parseRoute(hash: string) {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'c' && parts[1]) return { page: 'category' as const, id: parts[1], query: params }
  // Os geradores financeiros viraram uma tela só; os links antigos abrem nela, já no tipo certo.
  if (parts[0] === 'g' && Object.values(FINANCE_KINDS).includes(parts[1])) return { page: 'finance' as const, query: new URLSearchParams({ tipo: parts[1] }) }
  if (parts[0] === 'g' && parts[1]) return { page: 'generator' as const, id: parts[1], query: params }
  if (parts[0] === 'financeiro') return { page: 'finance' as const, query: params }
  if (parts[0] === 'v' && parts[1]) return { page: 'validator' as const, id: parts[1], query: params }
  if (parts[0] === 'files') return { page: 'files' as const, query: params }
  if (parts[0] === 'docs') return { page: 'docs' as const, query: params }
  if (parts[0] === 'massa') return { page: 'custom' as const, query: params }
  if (parts[0] === 'eventos') return { page: 'events' as const, query: params }
  if (parts[0] === 'scan') return { page: 'scan' as const, query: params }
  if (parts[0] === 'estrategia') {
    const id = parts[1] || params.get('s') || ''
    if (STRATEGIES.some((item) => item.id === id)) return { page: 'strategy' as const, id, query: params }
    return { page: 'strategy-home' as const, query: params }
  }
  return { page: 'home' as const, query: params }
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Notice | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const route = parseRoute(hash)
  const categories = CATS as Category[]

  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('home', route.page === 'home')
    return () => document.documentElement.classList.remove('home')
  }, [route.page])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('mf-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.detail || toast.bad ? 4200 : 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const button = document.getElementById('mf-generate') as HTMLButtonElement | null
        if (!button || button.disabled) return
        event.preventDefault()
        button.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const term = fold(search.trim())
    if (!term) return []
    const found: { href: string; label: string; detail: string }[] = []
    const extension = term.replace(/^\./, '')
    for (const family of FAM as { exts: string[] }[]) {
      if (family.exts.some((ext) => ext.toLocaleLowerCase('pt-BR') === extension)) {
        found.push({ href: `#/files?ext=${extension.toUpperCase()}`, label: `Arquivo ${extension.toUpperCase()}`, detail: 'Extensão' })
      }
    }
    if (fold('massa por estratégia configure regras, limites e combinações para gerar massas direcionadas aos seus cenários de teste.').includes(term)) {
      found.push({ href: '#/estrategia', label: 'Massa por estratégia', detail: 'Categoria' })
    }
    for (const strategy of STRATEGIES) {
      if (fold(`${strategy.name} ${strategy.desc}`).includes(term)) {
        found.push({ href: `#/estrategia/${strategy.id}`, label: strategy.name, detail: 'Massa por estratégia' })
      }
    }
    for (const category of categories) {
      const spec = VALIDATORS[category.id]
      if (spec && fold(`validar validador investigar conferir verificar ${category.name} ${spec.keywords}`).includes(term)) {
        found.push({ href: `#/v/${category.id}`, label: `Validar ${category.name.toLocaleLowerCase('pt-BR')}`, detail: 'Validar' })
      }
      for (const card of category.cards) {
        if (card.soon) continue
        const blob = fold([card.name, card.desc, card.kw, category.name, category.desc].filter(Boolean).join(' '))
        if (blob.includes(term)) found.push({ href: cardHref(card), label: card.name, detail: category.name })
      }
    }
    return found.slice(0, 8)
  }, [categories, search])

  function notify(message: string | Notice, bad?: boolean) {
    setToast(typeof message === 'string' ? { title: message, bad } : message)
  }

  function go(href: string) {
    window.location.hash = href
    setSearch('')
  }

  const lastGenerate = useRef<Record<string, string>>({})
  const currentCategory = categories.find((category) => category.cards.some((card) => card.eng === (route.page === 'generator' ? route.id : route.page === 'events' ? 'eventos' : route.page === 'finance' ? 'financeiro' : route.page === 'files' ? 'files' : route.page === 'docs' ? 'composer' : route.page === 'custom' ? 'combinadas' : '')))
  useEffect(() => {
    if (currentCategory && route.page !== 'category') lastGenerate.current[currentCategory.id] = hash
  }, [currentCategory, hash, route.page])

  // Eventos é uma tela só: o caminho para na categoria, sem repetir o nome.
  const crumbCategory = route.page === 'validator' ? categories.find((category) => category.id === route.id) : route.page === 'events' || route.page === 'finance' ? undefined : currentCategory
  const tabCategory = route.page === 'category' ? categories.find((category) => category.id === route.id) : route.page === 'events' || route.page === 'finance' ? currentCategory : crumbCategory
  const title = route.page === 'home'
    ? 'Início'
    : route.page === 'validator'
      ? 'Validar'
      : route.page === 'events'
        ? 'Eventos e ingressos'
        : route.page === 'finance'
          ? 'Financeiro e bancário'
    : route.page === 'category'
      ? categories.find((category) => category.id === route.id)?.name || 'Categoria'
      : route.page === 'files'
        ? 'Arquivos'
        : route.page === 'docs'
          ? 'Documentos'
          : route.page === 'custom'
            ? 'Massa personalizada'
            : route.page === 'strategy-home'
              ? 'Massa por estratégia'
              : route.page === 'strategy'
                ? STRATEGIES.find((item) => item.id === route.id)?.name || 'Massa por estratégia'
              : route.page === 'scan' ? 'Leitor' : cardFor(categories, route.id, route.query)?.name || 'Gerador'

  return (
    <div className="shell">
      <header className="top">
        <button className="brand" type="button" onClick={() => go('#/')}>
          <img src="/logo.png" alt="" />
          <strong>Toki</strong>
        </button>
        <SearchField
          aria-label="Buscar"
          placeholder="Buscar gerador ou extensão"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        >
          {results.length > 0 && (
            <div className="search-pop">
              {results.map((result) => (
                <button key={result.href + result.label} type="button" onClick={() => go(result.href)}>
                  {result.label}
                  <small>{result.detail}</small>
                </button>
              ))}
            </div>
          )}
        </SearchField>
        <button
          type="button"
          className="theme-toggle"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Tema escuro"
          title={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="theme-thumb" aria-hidden="true">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            )}
          </span>
        </button>
      </header>
      <main>
        {route.page === 'home' && (
          <section className="hero">
            {/* As duas paisagens ficam na página; o CSS mostra a do tema atual, então a troca é instantânea. */}
            <div className="hero-scene" aria-hidden="true">
              <img className="hero-day" src="/Cozy Pixel Meadow with Mouse and Laptop.png" alt="" />
              <img className="hero-night" src="/Moonlit Pixel Park with Mouse and Lantern.png" alt="" />
            </div>
            <div className="hero-copy">
              <h1>Toki</h1>
              <p className="hero-lead">Gere, personalize e valide dados de teste em um só lugar.</p>
            </div>
            <button type="button" className="hero-start" aria-label="Descer para as categorias" onClick={scrollHome}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </section>
        )}
        <div className={route.page === 'home' ? 'page page-home' : 'page'}>
        {route.page !== 'home' && route.page !== 'scan' && (
          <nav className="crumb">
            <button type="button" onClick={() => go('#/')}>Início</button>
            {route.page === 'strategy' ? (
              <>
                <span>/</span>
                <button type="button" onClick={() => go('#/estrategia')}>Massa por estratégia</button>
              </>
            ) : null}
            {crumbCategory && route.page !== 'category' ? (
              <>
                <span>/</span>
                <button type="button" onClick={() => go(categoryHref(crumbCategory))}>{crumbCategory.name}</button>
              </>
            ) : null}
            <span>/</span>
            <span>{title}</span>
          </nav>
        )}
        {route.page === 'home' && (
          <>
            <div className="grid" id="categorias">
              <button type="button" className="card card-star" onClick={() => go('#/estrategia')}>
                <span className="card-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="m12 2.8 2.1 6.3h6.6l-5.3 3.9 2 6.4L12 15.6 6.6 19.4l2-6.4L3.3 9.1h6.6L12 2.8Z" />
                  </svg>
                </span>
                <span className="card-star-text">
                  <h2>Massa por estratégia</h2>
                  <p>Regras, limites e combinações para montar a massa de cada cenário de teste.</p>
                </span>
                <span className="card-star-go" aria-hidden="true">→</span>
              </button>
              {categories.map((category) => (
                <button key={category.id} className="card" type="button" onClick={() => go(categoryHref(category))}>
                  <span className="card-icon"><CategoryIcon name={category.icon} /></span>
                  <span className="card-go" aria-hidden="true">→</span>
                  <h2>{category.name}</h2>
                  <p>{SHORT[category.id] ?? category.desc}</p>
                </button>
              ))}
            </div>
          </>
        )}
        {route.page === 'category' && (() => {
          const category = categories.find((item) => item.id === route.id)
          const cards = category?.cards ?? []
          return (
            <div className="screen">
              <header className="screen-head">
                <h1>{category?.name || 'Categoria'}</h1>
                {category?.desc ? <p>{category.desc}</p> : null}
              </header>
              <div className="grid">
                {cards.map((card) => card.soon ? (
                  <article key={card.name} className="pick soon">
                    <div className="pick-top">
                      <h2>{card.name}</h2>
                      <span>Em breve</span>
                    </div>
                    <p>{card.desc}</p>
                  </article>
                ) : (
                  <button key={card.name} className="pick" type="button" onClick={() => go(cardHref(card))}>
                    <h2>{card.name}</h2>
                    <p>{card.desc}</p>
                    <span className="pick-go">Configurar →</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}
        {tabCategory && VALIDATORS[tabCategory.id] && route.page !== 'home' ? (
          <nav className="mode-tabs" aria-label="Modo">
            <a
              href={categoryHref(tabCategory)}
              aria-current={route.page !== 'validator' ? 'page' : undefined}
              onClick={(event) => {
                // Volta para a última tela de gerar usada nesta categoria, com as opções da URL.
                event.preventDefault()
                go(lastGenerate.current[tabCategory.id] ?? categoryHref(tabCategory))
              }}
            >Gerar</a>
            <a
              href={`#/v/${tabCategory.id}`}
              aria-current={route.page === 'validator' ? 'page' : undefined}
              onClick={(event) => {
                // Eventos e Financeiro guardam o tipo escolhido na URL; a validação abre no mesmo tipo.
                const raw = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tipo')
                // Em Financeiro a URL guarda o motor (cartao); o validador espera o nome do tipo (Cartão).
                const tipo = tabCategory.id === 'financeiro' ? ({ cartao: 'Cartão', pix: 'PIX', boleto: 'Boleto' } as Record<string, string>)[raw ?? ''] : raw
                if (!tipo || route.page === 'validator') return
                event.preventDefault()
                go(`#/v/${tabCategory.id}?tipo=${encodeURIComponent(tipo)}`)
              }}
            >Validar</a>
          </nav>
        ) : null}
        {route.page === 'validator' && VALIDATORS[route.id] ? <ValidatePage key={`${route.id}?${route.query.toString()}`} id={route.id} query={route.query} onToast={notify} /> : null}
        {route.page === 'validator' && !VALIDATORS[route.id] ? <p className="banner bad">Essa categoria ainda não tem validação.</p> : null}
        {route.page === 'events' && <EventsPage query={route.query} onToast={notify} />}
        {route.page === 'finance' && <FinancePage query={route.query} onToast={notify} />}
        {route.page === 'scan' && <ScanPage query={route.query} />}
        {route.page === 'generator' && Boolean((ENG as Record<string, unknown>)[route.id]) ? <GeneratorPage key={`${route.id}?${route.query.toString()}`} id={route.id} query={route.query} onToast={notify} /> : null}
        {route.page === 'generator' && !((ENG as Record<string, unknown>)[route.id]) ? <p className="banner bad">Esse gerador não está no catálogo.</p> : null}
        {route.page === 'files' && <FilesPage extension={route.query.get('ext') || undefined} onToast={notify} />}
        {route.page === 'docs' && <ComposerPage format={route.query.get('fmt') || undefined} onToast={notify} />}
        {route.page === 'custom' && <CustomPage onToast={notify} />}
        {route.page === 'strategy-home' && <StrategyChooser onOpen={(id) => go(`#/estrategia/${id}`)} />}
        {route.page === 'strategy' && <StrategyPage key={route.id} strategy={route.id as StrategyId} onToast={notify} />}
        </div>
      </main>
      {toast ? (
        <div className={`toast${toast.bad ? ' bad' : ''}`} role="status">
          <div>
            <strong>{toast.title}</strong>
            {toast.detail ? <p>{toast.detail}</p> : null}
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setToast(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      ) : null}
    </div>
  )
}
