import { useEffect, useMemo, useState } from 'react'
import { CATS, ENG, FAM } from './domain/mfEngine.ts'
import { ComposerPage } from './pages/ComposerPage.tsx'
import { CustomPage } from './pages/CustomPage.tsx'
import { FilesPage } from './pages/FilesPage.tsx'
import { GeneratorPage } from './pages/GeneratorPage.tsx'
import { SearchField } from './ui/SearchField.tsx'

type Card = {
  name: string
  eng?: string
  desc?: string
  kw?: string
  soon?: number
  preset?: Record<string, string>
}
type Category = { id: string; name: string; desc: string; count?: string; direct?: boolean; cards: Card[] }

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
}

let blockFalling = false

function scrollHome() {
  const hero = document.querySelector('.hero')
  if (!(hero instanceof HTMLElement)) return
  const end = hero.offsetTop + hero.offsetHeight
  const button = document.querySelector('.hero-start')
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!(button instanceof HTMLElement) || blockFalling || reduce) {
    window.scrollTo({ top: end, behavior: 'smooth' })
    return
  }
  blockFalling = true
  const origin = button.getBoundingClientRect()
  const block = document.createElement('img')
  block.src = '/logo.png'
  block.alt = ''
  block.className = 'falling-block'
  const size = 58
  block.style.left = `${origin.left + origin.width / 2}px`
  block.style.top = `${origin.top + origin.height / 2}px`
  document.body.appendChild(block)
  const startScroll = window.scrollY
  const started = performance.now()
  const hopMs = 280
  window.setTimeout(() => window.scrollTo({ top: end, behavior: 'smooth' }), 160)
  const tick = (now: number) => {
    const elapsed = now - started
    const hop = Math.min(1, elapsed / hopMs)
    const hopY = Math.sin(hop * Math.PI) * 92
    const span = Math.max(1, end - startScroll)
    const progress = Math.min(1, Math.max(0, (window.scrollY - startScroll) / span))
    const base = origin.top + origin.height / 2
    const landing = window.innerHeight * 0.62
    const y = hop < 1 && progress < 0.12 ? base - hopY : base + progress * (landing - base)
    block.style.top = `${y}px`
    block.style.transform = `translate(-50%, -50%) rotate(${progress * 18 - (1 - hop) * 14}deg)`
    if ((progress < 0.98 || hop < 1) && elapsed < 1800) {
      requestAnimationFrame(tick)
      return
    }
    block.style.transform = ''
    block.classList.add('landed')
    window.setTimeout(() => {
      block.remove()
      blockFalling = false
    }, 420)
  }
  requestAnimationFrame(tick)
}

function cardHref(card: Card) {
  if (!card.eng || card.soon) return ''
  if (card.eng === 'files') return '#/files'
  if (card.eng === 'composer') return '#/docs'
  if (card.eng === 'combinadas') return '#/massa'
  const query = card.preset ? `?${new URLSearchParams(card.preset).toString()}` : ''
  return `#/g/${card.eng}${query}`
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
  if (parts[0] === 'g' && parts[1]) return { page: 'generator' as const, id: parts[1], query: params }
  if (parts[0] === 'files') return { page: 'files' as const, query: params }
  if (parts[0] === 'docs') return { page: 'docs' as const, query: params }
  if (parts[0] === 'massa') return { page: 'custom' as const, query: params }
  return { page: 'home' as const, query: params }
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
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
    const timer = window.setTimeout(() => setToast(null), 2200)
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
    for (const category of categories) {
      for (const card of category.cards) {
        if (card.soon) continue
        const blob = fold([card.name, card.desc, card.kw, category.name, category.desc].filter(Boolean).join(' '))
        if (blob.includes(term)) found.push({ href: cardHref(card), label: card.name, detail: category.name })
      }
    }
    return found.slice(0, 8)
  }, [categories, search])

  function notify(text: string, bad?: boolean) {
    setToast({ text, bad })
  }

  function go(href: string) {
    window.location.hash = href
    setSearch('')
  }

  const currentCategory = categories.find((category) => category.cards.some((card) => card.eng === (route.page === 'generator' ? route.id : route.page === 'files' ? 'files' : route.page === 'docs' ? 'composer' : route.page === 'custom' ? 'combinadas' : '')))
  const title = route.page === 'home'
    ? 'Início'
    : route.page === 'category'
      ? categories.find((category) => category.id === route.id)?.name || 'Categoria'
      : route.page === 'files'
        ? 'Arquivos'
        : route.page === 'docs'
          ? 'Documentos'
          : route.page === 'custom'
            ? 'Massa personalizada'
            : categories.flatMap((category) => category.cards).find((card) => card.eng === route.id)?.name || 'Gerador'

  return (
    <div className="shell">
      <header className="top">
        <button className="brand" type="button" onClick={() => go('#/')}>
          <img src="/logo.png" alt="" />
          <strong>MassForge</strong>
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
          className="theme"
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? 'Claro' : 'Escuro'}
        </button>
      </header>
      <main>
        {route.page === 'home' && (
          <section className="hero">
            <img src="/golden-hour.png" alt="Prado em voxel ao fim da tarde" />
            <h1>O que você vai testar hoje?</h1>
            <button type="button" className="hero-start" aria-label="Começar" onClick={scrollHome}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </section>
        )}
        <div className={route.page === 'home' ? 'page page-home' : 'page'}>
        {route.page !== 'home' && (
          <nav className="crumb">
            <button type="button" onClick={() => go('#/')}>Início</button>
            {currentCategory && route.page !== 'category' ? (
              <>
                <span>/</span>
                <button type="button" onClick={() => go(`#/c/${currentCategory.id}`)}>{currentCategory.name}</button>
              </>
            ) : null}
            <span>/</span>
            <span>{title}</span>
          </nav>
        )}
        {route.page === 'home' && (
          <>
            <div className="grid" id="categorias">
              {categories.map((category) => (
                <button key={category.id} className="card" type="button" onClick={() => go(categoryHref(category))}>
                  <h2>{category.name}</h2>
                  <p>{category.desc}</p>
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
        {route.page === 'generator' && Boolean((ENG as Record<string, unknown>)[route.id]) ? <GeneratorPage key={`${route.id}?${route.query.toString()}`} id={route.id} query={route.query} onToast={notify} /> : null}
        {route.page === 'generator' && !((ENG as Record<string, unknown>)[route.id]) ? <p className="banner bad">Esse gerador não está no catálogo.</p> : null}
        {route.page === 'files' && <FilesPage extension={route.query.get('ext') || undefined} onToast={notify} />}
        {route.page === 'docs' && <ComposerPage format={route.query.get('fmt') || undefined} onToast={notify} />}
        {route.page === 'custom' && <CustomPage onToast={notify} />}
        </div>
      </main>
      {toast ? <div className="toast" role="status">{toast.text}</div> : null}
    </div>
  )
}
