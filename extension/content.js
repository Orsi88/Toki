// Captura Inteligente · content script. Injetado só quando a pessoa clica em "Capturar formulário"
// (activeTab + scripting). Não lê valores, não dispara eventos da página e limpa tudo ao sair.
(() => {
  if (window.__tokiCapture) window.__tokiCapture.cancel()
  const T = globalThis.TokiCapture
  // O menu define o modo antes de injetar: capturar (revisar e mandar ao Toki) ou preencher direto.
  const start = globalThis.__tokiStart || { mode: 'capture', rule: 'Válido' }
  delete globalThis.__tokiStart
  let fillRule = start.rule
  const CONTROL = 'input, select, textarea, [role="textbox"], [role="combobox"], [role="checkbox"], [role="switch"], [role="radio"], [contenteditable="true"], [contenteditable=""]'
  const GROUP = 'form, dialog, [role="dialog"], [role="form"], fieldset'
  const LINKABLE_DATE = new Set(['Data', 'Data e hora'])
  const DATE_SOURCES = new Set(['Data', 'Data de nascimento', 'Data e hora'])

  const host = document.createElement('div')
  host.setAttribute('data-toki-capture', '')
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;'
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>
    :host { --ok:#357b62; --bg:#ffffff; --ink:#302a2a; --muted:#716966; --line:#e5e0da; --primary:#66504b; --primary-ink:#fff; --focus:#527f91; --warn:#a66b25; --warn-soft:#f6ead9; --bad:#b34e4c; --wash:#f8f6f3; }
    @media (prefers-color-scheme: dark) { :host { --ok:#8fd1b4; --bg:#2a2524; --ink:#f5f0ea; --muted:#bdb3ad; --line:#4a4240; --primary:#a7c4ce; --primary-ink:#24343a; --focus:#a7c4ce; --warn:#e2b77a; --warn-soft:#4a3a26; --bad:#f0a3a1; --wash:#332d2c; } }
    * { box-sizing: border-box; font-family: "DM Sans", "Segoe UI", system-ui, sans-serif; }
    .box { position: fixed; border: 2px solid var(--focus); background: color-mix(in srgb, var(--focus) 12%, transparent); border-radius: 8px; pointer-events: none; transition: all .08s; display: none; }
    .chip { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 24px); background: var(--primary); color: var(--primary-ink); padding: 6px 6px 6px 14px; border-radius: 999px; font-size: 13px; pointer-events: auto; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .chip-x { flex: none; width: 28px; height: 28px; min-height: 28px; padding: 0; border-radius: 50%; border: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-ink) 18%, transparent); color: var(--primary-ink); font-size: 14px; }
    .chip-x:hover { background: color-mix(in srgb, var(--primary-ink) 30%, transparent); }
    .panel { position: fixed; top: 12px; right: 12px; width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 24px); display: flex; flex-direction: column; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; pointer-events: auto; box-shadow: 0 12px 32px rgba(0,0,0,.3); font-size: 13px; overflow: hidden; }
    .head { display: flex; align-items: flex-start; gap: 10px; padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
    .head h2 { font-size: 15px; margin: 0; } .head p { margin: 2px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .head .count { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: var(--wash); border: 1px solid var(--line); font-size: 11px; font-weight: 600; vertical-align: 2px; }
    .icon { flex: none; margin-left: auto; width: 30px; height: 30px; padding: 0; border-radius: 50%; display: grid; place-items: center; font-size: 16px; line-height: 1; }
    .body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 10px 14px; overscroll-behavior: contain; }
    .form-name { display: grid; gap: 3px; margin-bottom: 8px; }
    label, .caption { font-size: 11.5px; color: var(--muted); }
    input, select { width: 100%; min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); font-size: 13px; }
    .field { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr) 30px; gap: 6px 8px; align-items: center; padding: 10px; margin: 6px 0; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
    .num { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--bg); border: 1px solid var(--line); font-size: 11px; color: var(--muted); }
    .field .remove { width: 30px; height: 30px; padding: 0; border-radius: 8px; color: var(--muted); }
    .field .wide { grid-column: 2 / -1; min-width: 0; }
    .meta { font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; line-height: 1.45; }
    .conf { display: inline-block; padding: 0 6px; border-radius: 999px; border: 1px solid var(--line); margin-right: 4px; }
    .low .conf { color: var(--warn); border-color: var(--warn); }
    .link { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: center; }
    .hint { background: var(--warn-soft); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; overflow-wrap: anywhere; }
    .empty { padding: 18px 8px; text-align: center; color: var(--muted); }
    .tools { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
    .text { border: 0; background: none; padding: 6px 2px; color: var(--focus); font-size: 12.5px; }
    .bar { display: flex; align-items: center; gap: 6px; }
    .bar .sep { width: 1px; height: 24px; background: var(--line); margin: 0 2px; }
    .tool { position: relative; width: 38px; height: 38px; min-height: 38px; padding: 0; display: grid; place-items: center; border-radius: 10px; }
    .tool svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    .tool.ok { color: var(--ok); } .tool.no { color: var(--bad); }
    .tool.primary { width: auto; padding: 0 14px; margin-left: auto; display: flex; gap: 8px; }
    .tool::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); padding: 5px 8px; border-radius: 6px; background: var(--ink); color: var(--bg); font-size: 11.5px; font-weight: 500; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .12s; z-index: 2; }
    .tool:first-child::after { left: 0; transform: none; }
    .tool.primary::after { left: auto; right: 0; transform: none; }
    .tool:hover::after, .tool:focus-visible::after { opacity: 1; }
    .foot { padding: 10px 14px 14px; border-top: 1px solid var(--line); display: grid; gap: 8px; background: var(--bg); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .actions .primary { grid-column: 1 / -1; }
    button { border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 0 12px; min-height: 34px; font-size: 13px; cursor: pointer; }
    button:hover:not(:disabled) { border-color: var(--focus); }
    button.primary { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); font-weight: 600; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .status { margin: 0; font-size: 12.5px; padding: 6px 8px; border-radius: 8px; background: var(--wash); overflow-wrap: anywhere; } .status.bad { color: var(--bad); }
  </style><div class="box"></div><div class="chip"><span class="chip-text" role="status"></span><button type="button" class="chip-x" aria-label="Cancelar seleção" title="Cancelar (Esc)">✕</button></div>`
  const box = root.querySelector('.box')
  const chip = root.querySelector('.chip')
  const chipText = root.querySelector('.chip-text')
  // O X sempre funciona, mesmo quando o Esc não chega à página (foco em outro lugar).
  root.querySelector('.chip-x').addEventListener('click', () => {
    if (appending) { stopSelecting(); renderReview() } else cancel()
  })
  document.documentElement.appendChild(host)

  let current = null
  let trail = []
  let selecting = true
  let appending = false
  let fields = []
  let formName = ''
  let ignored = 0
  let unreadFrames = 0
  let nextKey = 1
  let panel = null

  function setChip() {
    chipText.textContent = appending
      ? 'Toki · clique no bloco com os campos a acrescentar · ↑ amplia · Esc volta à revisão'
      : start.mode === 'fill'
        ? `Toki · clique no formulário para preencher com dados ${fillRule === 'Válido' ? 'válidos' : 'inválidos'} · ↑ amplia · Esc cancela`
        : 'Toki · passe o mouse e clique no formulário · ↑ amplia · Esc cancela'
    chip.style.display = ''
  }
  setChip()

  // ---------- busca que atravessa shadow DOM aberto (componentes web); o fechado é inacessível por definição ----------
  function deepAll(scope, selector) {
    const found = [...scope.querySelectorAll(selector)]
    for (const element of scope.querySelectorAll('*')) {
      if (element.shadowRoot && element !== host) found.push(...deepAll(element.shadowRoot, selector))
    }
    return found
  }
  const controlsIn = (element) => deepAll(element, CONTROL).length
  const parentOf = (element) => element.parentElement || (element.parentNode instanceof ShadowRoot ? element.parentNode.host : null)

  function groupFor(target) {
    const group = target.closest(GROUP)
    if (group && controlsIn(group)) return group
    for (let element = target; element && element !== document.documentElement; element = parentOf(element)) {
      if (controlsIn(element) >= 2) return element
    }
    for (let element = target; element && element !== document.documentElement; element = parentOf(element)) {
      if (element.matches(CONTROL) || controlsIn(element) >= 1) return element
    }
    return null
  }

  function show(element) {
    current = element
    if (!element) { box.style.display = 'none'; return }
    const rect = element.getBoundingClientRect()
    Object.assign(box.style, { display: 'block', left: `${rect.left - 3}px`, top: `${rect.top - 3}px`, width: `${rect.width + 6}px`, height: `${rect.height + 6}px` })
  }

  const fromPanel = (event) => event.composedPath().includes(host)
  const deepTarget = (event) => event.composedPath()[0] instanceof Element ? event.composedPath()[0] : event.target
  const block = (event) => { if (selecting && !fromPanel(event)) { event.preventDefault(); event.stopImmediatePropagation() } }
  function onMove(event) {
    if (!selecting || fromPanel(event)) return
    trail = []
    show(groupFor(deepTarget(event)))
  }
  function onClick(event) {
    if (!selecting || fromPanel(event)) return
    block(event)
    if (current) capture(current)
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (selecting && appending) { stopSelecting(); renderReview() } else cancel()
      return
    }
    if (!selecting) {
      if (fromPanel(event)) event.stopImmediatePropagation() // atalhos da página não reagem ao que se digita na revisão
      return
    }
    if (event.key === 'ArrowUp' && current) {
      event.preventDefault()
      let parent = parentOf(current)
      while (parent && parent !== document.documentElement && controlsIn(parent) === controlsIn(current)) parent = parentOf(parent)
      if (parent && parent !== document.documentElement) { trail.push(current); show(parent) }
    } else if (event.key === 'ArrowDown' && trail.length) {
      event.preventDefault()
      show(trail.pop())
    } else if (event.key === 'Enter' && current) {
      event.preventDefault()
      capture(current)
    }
  }

  // Em SPA a troca de rota não dispara pagehide; se o endereço muda durante a seleção, ela é encerrada.
  let lastUrl = location.href
  const watch = setInterval(() => {
    if (location.href === lastUrl) return
    lastUrl = location.href
    if (selecting && !appending) cancel()
    else if (selecting) { stopSelecting(); renderReview({ text: 'A página mudou de endereço; a seleção foi interrompida e a revisão continua.' }) }
  }, 400)
  const onScroll = () => { if (selecting && current) show(current) }

  const listeners = [['mousemove', onMove], ['click', onClick], ['mousedown', block], ['mouseup', block], ['pointerdown', block], ['pointerup', block], ['keydown', onKey], ['scroll', onScroll], ['pagehide', cancel]]
  for (const [type, handler] of listeners) window.addEventListener(type, handler, true)

  // ---------- extração: só atributos, labels e opções; nunca .value, .checked ou textContent de campos ----------
  const tidy = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  function textWithoutControls(element) {
    const clone = element.cloneNode(true)
    clone.querySelectorAll('input, select, textarea, [contenteditable]').forEach((node) => node.remove())
    return tidy(clone.textContent)
  }
  function shown(element) {
    if (!element.getClientRects().length) return false
    return getComputedStyle(element).visibility !== 'hidden'
  }
  // Texto que acompanha o campo quando o site usa <div>/<span> como rótulo: o irmão anterior (sem campos dentro),
  // subindo até 3 níveis enquanto o bloco for só deste campo. Nunca lê valores.
  function nearbyText(element) {
    let node = element
    for (let depth = 0; depth < 3 && node && node !== document.body; depth += 1) {
      for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (prev.matches(CONTROL) || prev.querySelector(CONTROL)) return ''
        const text = textWithoutControls(prev)
        if (text && text.length <= 80) return text
      }
      const parent = node.parentElement
      if (!parent || deepAll(parent, CONTROL).length > 1) return ''
      node = parent
    }
    return ''
  }

  function labelOf(element) {
    const scope = element.getRootNode()
    const by = element.getAttribute('aria-labelledby')
    if (by) {
      const text = by.split(/\s+/).map((id) => scope.getElementById?.(id) || document.getElementById(id)).filter(Boolean).map(textWithoutControls).join(' ')
      if (tidy(text)) return tidy(text)
    }
    if (element.getAttribute('aria-label')) return tidy(element.getAttribute('aria-label'))
    if (element.labels && element.labels.length) return textWithoutControls(element.labels[0])
    const wrap = element.closest('label')
    if (wrap) return textWithoutControls(wrap)
    if (element.getAttribute('role') && !/^(textbox|combobox)$/.test(element.getAttribute('role'))) return textWithoutControls(element)
    if (scope instanceof ShadowRoot && scope.host.getAttribute('aria-label')) return tidy(scope.host.getAttribute('aria-label'))
    return nearbyText(element) || tidy(element.getAttribute('placeholder') || element.getAttribute('title') || '')
  }
  function numberAttr(element, name) {
    const raw = element.getAttribute(name)
    if (raw === null || raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  function metaOf(element) {
    const tag = element.tagName.toLowerCase()
    const role = element.getAttribute('role')
    const type = tag === 'input' ? (element.getAttribute('type') || 'text').toLowerCase()
      : role === 'checkbox' || role === 'switch' ? 'checkbox' : role === 'radio' ? 'radio' : tag === 'textarea' || element.isContentEditable ? 'textarea' : tag === 'select' ? 'select' : 'text'
    const options = tag === 'select'
      ? [...element.querySelectorAll('option')].filter((option) => option.getAttribute('value') !== '').map((option) => tidy(option.textContent)).filter(Boolean)
      : []
    const list = element.getAttribute('list') ? element.getRootNode().getElementById?.(element.getAttribute('list')) : null
    return {
      controlType: tag === 'select' ? 'select' : type === 'textarea' ? 'textarea' : type,
      type,
      id: element.id || '',
      name: element.getAttribute('name') || '',
      label: labelOf(element),
      placeholder: element.getAttribute('placeholder') || '',
      autocomplete: element.getAttribute('autocomplete') || '',
      required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      disabled: element.disabled || element.getAttribute('aria-disabled') === 'true',
      readOnly: element.readOnly || element.getAttribute('aria-readonly') === 'true',
      hidden: !shown(element) && !(element.labels && [...element.labels].some(shown)),
      multiple: element.multiple || false,
      step: element.getAttribute('step') || '',
      options,
      datalist: Boolean(list),
      accept: type === 'file' ? element.getAttribute('accept') || '' : '',
      constraints: {
        minLength: numberAttr(element, 'minlength'), maxLength: numberAttr(element, 'maxlength'),
        min: numberAttr(element, 'min'), max: numberAttr(element, 'max'),
        step: element.getAttribute('step') || undefined, pattern: element.getAttribute('pattern') || undefined,
      },
    }
  }

  function extract(container) {
    const found = []
    const groups = new Map()
    let skipped = 0
    const elements = container.matches(CONTROL) ? [container] : deepAll(container, CONTROL)
    for (const element of elements) {
      if (host.contains(element)) continue
      if (element.closest('[contenteditable]') && element.closest('[contenteditable]') !== element) continue
      const meta = metaOf(element)
      if (T.ignoreReason(meta)) { skipped += 1; continue }
      const isRadio = meta.type === 'radio'
      const scope = element.getRootNode()
      const groupKey = isRadio ? (meta.name || element.closest('[role="radiogroup"]')?.id || 'radio')
        : meta.type === 'checkbox' && meta.name && scope.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(meta.name)}"]`).length > 1 ? `cb:${meta.name}` : null
      meta.el = element
      if (groupKey) {
        let group = groups.get(groupKey)
        if (!group) {
          const holder = element.closest('fieldset, [role="radiogroup"], [role="group"]')
          const legend = holder?.querySelector('legend') ? textWithoutControls(holder.querySelector('legend')) : holder?.getAttribute('aria-label') || ''
          group = { ...meta, el: null, items: [], controlType: isRadio ? 'radio' : 'checkbox-group', label: tidy(legend) || meta.name, options: [] }
          groups.set(groupKey, group)
          found.push(group)
        }
        group.required = group.required || meta.required
        if (meta.label) { group.options.push(meta.label); group.items.push({ el: element, label: meta.label }) }
        continue
      }
      found.push(meta)
    }
    const frames = container.matches('iframe') ? [container] : deepAll(container, 'iframe')
    return {
      skipped,
      frames: frames.length,
      fields: found.map((meta) => {
        const guess = T.inferGenerator(meta)
        const hint = [guess.hint, meta.datalist ? 'Tem sugestões (datalist) no formulário; o Toki não as usa.' : ''].filter(Boolean).join(' ')
        // O nome da coluna é o que a pessoa vê na tela (label, senão placeholder); o nome técnico fica à parte para achar o campo.
        return { ...meta, key: `f${nextKey++}`, technical: meta.name || meta.id || '', name: meta.label || meta.placeholder || meta.name || meta.id || 'campo', type: guess.type, confidence: guess.confidence, source: guess.source, hint }
      }),
    }
  }

  function capture(container) {
    if (!container.isConnected) { show(null); return } // o bloco sumiu (modal fechou, SPA redesenhou): escolha de novo
    const result = extract(container)
    const heading = container.querySelector('legend, h1, h2, h3, [role="heading"]')
    const name = tidy(container.getAttribute('aria-label') || (heading && textWithoutControls(heading)) || container.getAttribute('name') || container.id || document.title || 'Formulário')
    let status
    if (appending) {
      const seen = new Set(fields.map((field) => `${field.name}|${field.controlType}`))
      const fresh = result.fields.filter((field) => !seen.has(`${field.name}|${field.controlType}`))
      fields.push(...fresh)
      ignored += result.skipped
      unreadFrames += result.frames
      status = { text: `${fresh.length} campos acrescentados${result.fields.length - fresh.length ? `; ${result.fields.length - fresh.length} já estavam na revisão` : ''}.` }
    } else {
      fields = result.fields
      formName = name
      ignored = result.skipped
      unreadFrames = result.frames
    }
    T.linkDependencies(fields)
    stopSelecting()
    if (start.mode === 'fill' && !status) {
      status = fillForm(fillRule)
      start.mode = 'capture'
    }
    renderReview(status)
  }

  // ---------- preencher: uma linha do motor do Toki (mesma pessoa, opções, limites e vínculos) ----------
  function columnFor(field, rule, keys) {
    const c = field.constraints || {}
    const extra = {}
    let type = field.type
    if (type === 'Lista de opções') {
      if (field.options?.length) extra.options = field.options
      else type = 'Texto curto'
    }
    if (type === 'Cópia de outra coluna') {
      if (keys.has(field.ref)) extra.ref = field.ref
      else type = 'Texto curto'
    }
    if (LINKABLE_DATE.has(type) && keys.has(field.after)) extra.after = field.after
    if (type === 'Texto curto' && Number.isInteger(c.maxLength) && c.maxLength >= 1 && c.maxLength <= 10000) extra.maxLength = c.maxLength
    if (type === 'Número inteiro') {
      if (Number.isInteger(c.min)) extra.min = c.min
      if (Number.isInteger(c.max)) extra.max = c.max
      if (extra.min !== undefined && extra.max !== undefined && extra.min > extra.max) { delete extra.min; delete extra.max }
    }
    return { id: field.key, name: field.key, type, rule, extra: Object.keys(extra).length ? extra : undefined }
  }

  // Campos de upload recebem um arquivo de exemplo do Toki (tipo pedido pelo accept; no inválido, um tipo fora dele).
  async function attachSamples(uploads, rule, done, missed) {
    let attached = 0
    const names = []
    for (const field of uploads) {
      try {
        const sample = await globalThis.TokiEngine.sampleFile(field.accept || '', rule === 'Válido')
        const transfer = new DataTransfer()
        transfer.items.add(new File([sample.bytes], sample.name, { type: sample.type }))
        field.el.files = transfer.files
        field.el.dispatchEvent(new Event('input', { bubbles: true }))
        field.el.dispatchEvent(new Event('change', { bubbles: true }))
        attached += 1
        names.push(`${sample.name}${sample.corrupt ? ' (corrompido)' : ''}`)
      } catch {
        missed.push(field.name)
      }
    }
    const kind = rule === 'Válido' ? 'válidos' : 'inválidos'
    renderReview({
      text: `${done + attached} campos preenchidos com dados ${kind}; ${attached ? `anexado: ${names.join(', ')}` : 'nenhum arquivo anexado'}${missed.length ? `; sem preencher: ${missed.join(', ')}` : ''}. O formulário não foi enviado.`,
    })
  }

  function fillForm(rule) {
    fillRule = rule
    const targets = fields.filter((field) => (field.el || field.items?.length) && field.controlType !== 'file')
    const uploads = fields.filter((field) => field.el && field.controlType === 'file')
    if (!targets.length) return { bad: true, text: 'Nenhum campo da página para preencher.' }
    const keys = new Set(fields.map((field) => field.key))
    let record
    try {
      record = globalThis.TokiEngine.row(fields.map((field) => columnFor(field, rule, keys)))
    } catch (error) {
      return { bad: true, text: `Não foi possível gerar: ${error.message}` }
    }
    // Campo de senha sem tipo próprio no motor: valor com cara de senha; a confirmação acompanha.
    const secret = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
      return `Tk@${Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => chars[n % chars.length]).join('')}`
    }
    const passwords = {}
    for (const field of fields) {
      if (field.controlType === 'password' && field.type === 'Texto curto') {
        passwords[field.key] = record.checks[field.key] === 'passa' ? secret() : '123'
        record.values[field.key] = passwords[field.key]
      }
    }
    for (const field of fields) {
      if (field.type === 'Cópia de outra coluna' && field.ref in passwords) {
        record.values[field.key] = record.checks[field.key] === 'passa' ? passwords[field.ref] : `${passwords[field.ref]}x`
      }
    }
    let done = 0
    const missed = []
    for (const field of targets) {
      const value = record.values[field.key] ?? ''
      let ok
      if (field.items?.length) {
        const item = field.items.find((option) => option.label === value)
        ok = Boolean(item) && globalThis.TokiFill.fill(item.el, 'true')
      } else ok = globalThis.TokiFill.fill(field.el, value)
      if (ok) done += 1
      else missed.push(field.name)
    }
    const kind = rule === 'Válido' ? 'válidos' : 'inválidos'
    if (uploads.length) attachSamples(uploads, rule, done, missed)
    return {
      bad: missed.length > 0 && done === 0,
      text: `${done} campos preenchidos com dados ${kind}${missed.length ? `; sem preencher: ${missed.join(', ')}` : ''}. O formulário não foi enviado.`,
    }
  }

  function stopSelecting() {
    selecting = false
    appending = false
    box.style.display = 'none'
    chip.style.display = 'none'
  }

  // ---------- painel de revisão ----------
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
      else if (key === 'text') node.textContent = value
      else node.setAttribute(key, value)
    }
    for (const child of children) if (child) node.append(child)
    return node
  }
  function constraintText(field) {
    const c = field.constraints || {}
    const parts = []
    if (field.required) parts.push('obrigatório')
    if (c.minLength !== undefined || c.maxLength !== undefined) parts.push(`tamanho ${c.minLength ?? 0}–${c.maxLength ?? '∞'}`)
    if (c.min !== undefined || c.max !== undefined) parts.push(`valor ${c.min ?? '…'}–${c.max ?? '…'}`)
    if (c.pattern) parts.push(`padrão ${c.pattern}`)
    if (field.options?.length) parts.push(`${field.options.length} opções`)
    return parts.join(' · ')
  }

  function linkControl(field) {
    const copies = field.type === 'Cópia de outra coluna'
    if (!copies && !LINKABLE_DATE.has(field.type)) return null
    const candidates = fields.filter((other) => other !== field && (copies || DATE_SOURCES.has(other.type)))
    const key = copies ? 'ref' : 'after'
    const select = el('select', { 'aria-label': copies ? `Coluna que ${field.name} copia` : `Data anterior a ${field.name}`, 'data-focus': `${field.key}:link`, onchange: (event) => { field[key] = event.target.value || undefined } }, [
      el('option', { value: '', text: copies ? 'Escolha a coluna…' : 'Sem vínculo' }),
      ...candidates.map((other) => el('option', { value: other.key, text: other.name })),
    ])
    select.value = candidates.some((other) => other.key === field[key]) ? field[key] : ''
    return el('div', { class: 'wide link' }, [el('span', { class: 'caption', text: copies ? 'Copia' : 'Depois de' }), select])
  }

  function fieldRow(field, index) {
    const type = el('select', { 'aria-label': `Gerador de ${field.name}`, 'data-focus': `${field.key}:type`, onchange: (event) => { field.type = event.target.value; field.confidence = 1; field.source = 'manual'; renderReview() } },
      T.CATALOG.map((option) => el('option', { value: option, text: option })))
    type.value = field.type
    const low = field.confidence < 0.6
    const extra = [field.technical && field.technical !== field.name ? `campo ${field.technical}` : '', field.controlType, constraintText(field)].filter(Boolean).join(' · ')
    return el('div', { class: `field${low ? ' low' : ''}` }, [
      el('span', { class: 'num', text: String(index + 1), 'aria-hidden': 'true' }),
      el('input', { value: field.name, 'aria-label': `Nome da coluna ${index + 1}`, 'data-focus': `${field.key}:name`, oninput: (event) => { field.name = event.target.value } }),
      type,
      el('button', { class: 'remove', type: 'button', text: '✕', title: 'Remover campo', 'aria-label': `Remover ${field.name}`, onclick: () => { fields.splice(index, 1); renderReview() } }),
      el('div', { class: 'wide meta' }, [
        el('span', { class: 'conf', title: `Origem: ${field.source}`, text: `${Math.round(field.confidence * 100)}%${low ? ' · confira' : ''}` }),
        document.createTextNode(extra),
      ]),
      linkControl(field),
      field.hint ? el('div', { class: 'wide hint', text: field.hint }) : null,
    ])
  }

  const ICONS = {
    add: 'M12 5v14 M5 12h14',
    more: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M12 9v6 M9 12h6',
    redo: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4',
    valid: 'M5 4h10l4 4v12H5z M8.5 13.5l2.2 2.2 4.8-4.8',
    invalid: 'M5 4h10l4 4v12H5z M9.5 11l5 5 M14.5 11l-5 5',
    send: 'M4 12l16-8-6 16-2.5-6.5z M11.5 13.5L20 4',
  }
  function tool(name, tip, onclick, cls = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', ICONS[name])
    svg.append(path)
    return el('button', { class: `tool ${cls}`.trim(), type: 'button', 'aria-label': tip, 'data-tip': tip, onclick }, [svg])
  }

  function renderReview(status) {
    // Re-renderiza sem perder a rolagem nem o foco de quem está editando.
    const scroll = panel?.querySelector('.body')?.scrollTop ?? 0
    const focusKey = root.activeElement?.getAttribute?.('data-focus')
    const first = !panel
    panel?.remove()
    const addField = () => { fields.push({ key: `f${nextKey++}`, name: `campo_${fields.length + 1}`, label: '', controlType: 'manual', type: 'Texto curto', confidence: 1, source: 'manual', constraints: {}, options: [] }); renderReview() }
    const send = tool('send', 'Enviar para a Massa Personalizada', submit, 'primary')
    send.append(document.createTextNode('Enviar ao Toki'))
    const fillValid = tool('valid', 'Preencher a página com dados válidos', () => renderReview(fillForm('Válido')), 'ok')
    const fillInvalid = tool('invalid', 'Preencher a página com dados inválidos', () => renderReview(fillForm('Inválido')), 'no')
    if (!fields.length) for (const button of [send, fillValid, fillInvalid]) { button.disabled = true; button.dataset.tip = 'Inclua ao menos um campo' }
    const notes = [
      ignored ? `${ignored} ignorados (ocultos, técnicos, desabilitados ou somente leitura)` : '',
      unreadFrames ? `${unreadFrames} iframe(s) não lidos` : '',
    ].filter(Boolean).join(' · ')
    const nameInput = el('input', { value: formName, id: 'toki-form-name', 'data-focus': 'form-name', oninput: (event) => { formName = event.target.value } })
    const body = el('div', { class: 'body' }, [
      el('div', { class: 'form-name' }, [el('label', { for: 'toki-form-name', text: 'Nome do formulário' }), nameInput]),
      ...(fields.length ? fields.map(fieldRow) : [el('p', { class: 'empty', text: 'Nenhum campo elegível neste bloco. Capture outro bloco ou adicione um campo.' })]),
    ])
    panel = el('section', { class: 'panel', role: 'dialog', 'aria-label': 'Revisão da captura Toki' }, [
      el('header', { class: 'head' }, [
        el('div', {}, [
          el('h2', {}, [document.createTextNode('Revisar formulário'), el('span', { class: 'count', text: `${fields.length} campos` })]),
          el('p', { text: `Só a estrutura foi lida, nunca o que está digitado.${notes ? ` ${notes}.` : ''}` }),
        ]),
        el('button', { class: 'icon', type: 'button', text: '✕', title: 'Fechar (Esc)', 'aria-label': 'Fechar', onclick: cancel }),
      ]),
      body,
      el('footer', { class: 'foot' }, [
        status ? el('p', { class: `status${status.bad ? ' bad' : ''}`, role: status.bad ? 'alert' : 'status', text: status.text }) : null,
        el('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Ações da captura' }, [
          tool('add', 'Adicionar campo', addField),
          tool('more', 'Capturar mais campos (outra aba ou etapa)', () => select(true)),
          tool('redo', 'Refazer a captura', () => select(false)),
          el('span', { class: 'sep', 'aria-hidden': 'true' }),
          fillValid,
          fillInvalid,
          send,
        ]),
      ]),
    ])
    root.append(panel)
    body.scrollTop = scroll
    const again = focusKey && panel.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)
    if (again) again.focus()
    else if (first) nameInput.focus()
  }

  function submit() {
    if (fields.some((field) => !field.name.trim())) { renderReview({ bad: true, text: 'Todo campo precisa de um nome de coluna.' }); return }
    const orphan = fields.find((field) => field.type === 'Cópia de outra coluna' && !fields.some((other) => other.key === field.ref))
    if (orphan) { renderReview({ bad: true, text: `Escolha a coluna que "${orphan.name}" copia.` }); return }
    const payload = T.buildPayload({ captureId: crypto.randomUUID(), formName, fields })
    chrome.runtime.sendMessage({ type: 'toki:send', payload }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        renderReview({ bad: true, text: `Não foi possível enviar: ${response?.error || chrome.runtime.lastError?.message || 'erro desconhecido'}. A revisão continua aqui; tente de novo.` })
      } else {
        renderReview({ text: 'Enviado. O Toki abriu numa nova aba com a revisão da importação. Você pode reenviar ou fechar.' })
      }
    })
  }

  function select(append) {
    panel?.remove()
    panel = null
    if (!append) fields = []
    appending = append
    selecting = true
    lastUrl = location.href
    setChip()
  }

  function cancel() {
    for (const [type, handler] of listeners) window.removeEventListener(type, handler, true)
    clearInterval(watch)
    host.remove()
    delete window.__tokiCapture
  }

  window.__tokiCapture = { cancel }
})()
