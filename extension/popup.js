// Toki · menu da extensão. Gera com o motor do Toki (engine.js), insere no campo em que a pessoa clicou
// e copia. Abrir o menu concede activeTab, então funciona em qualquer site sem permissão ampla.
const E = globalThis.TokiEngine
const $ = (selector) => document.querySelector(selector)
const DEFAULT_URL = 'http://localhost:5173/'
let rule = 'Válido'
let last = null

const store = {
  get: (key) => chrome.storage.local.get(key).then((data) => data[key]),
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
}

async function tab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  return active
}

async function copy(text) {
  // A área de transferência pode ficar pendente (janela sem foco); o menu não espera mais que 1 s por ela.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 1000))
  return Promise.race([navigator.clipboard.writeText(text).then(() => true, () => false), timeout])
}

async function insert(value) {
  const { id } = await tab()
  const run = async (allFrames) => {
    await chrome.scripting.executeScript({ target: { tabId: id, allFrames }, files: ['fill.js'] })
    const results = await chrome.scripting.executeScript({ target: { tabId: id, allFrames }, func: (text) => globalThis.TokiFill.insertFocused(text), args: [value] })
    return results.map((item) => item.result).find((item) => item?.ok)
  }
  try {
    return await run(true)
  } catch {
    try { return await run(false) } catch { return null } // páginas do navegador e da loja não aceitam scripts
  }
}

function show(view) {
  for (const id of ['home', 'person', 'more']) $(`#${id}`).hidden = id !== view
}

function result(type, value, note, tone) {
  $('#result').hidden = false
  $('#result').className = `result ${tone}`
  $('#result-type').textContent = type
  $('#result-value').textContent = value === '' ? '(vazio)' : value
  $('#result-note').textContent = note
}

async function apply(type, value, ok) {
  last = { type, value }
  const [inserted, copied] = await Promise.all([insert(value), copy(value)])
  const validity = ok ? 'válido' : 'inválido'
  if (inserted) result(type, value, `${validity} · inserido em “${inserted.label}”${copied ? ' e copiado' : ''}`, 'ok')
  else result(type, value, `${validity} · ${copied ? 'copiado' : 'não copiado'} (nenhum campo selecionado na página)`, copied ? '' : 'warn')
}

async function generate(type) {
  const { value, ok } = E.one(type, rule)
  await apply(type, value, ok)
}

function renderPerson() {
  const list = $('#person-list')
  list.replaceChildren(...E.person(rule).map(({ type, value, ok }) => {
    const button = document.createElement('button')
    button.type = 'button'
    const text = document.createElement('span')
    text.textContent = value || '(vazio)'
    const small = document.createElement('small')
    small.textContent = type
    button.append(text, small)
    button.addEventListener('click', () => apply(type, value, ok))
    const item = document.createElement('li')
    item.append(button)
    return item
  }))
  show('person')
}

function renderTypes(filter = '') {
  const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const wanted = fold(filter.trim())
  $('#types').replaceChildren(...E.TYPES.filter((type) => fold(type).includes(wanted)).map((type) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = type
    button.addEventListener('click', () => generate(type))
    const item = document.createElement('li')
    item.append(button)
    return item
  }))
}

async function startForm(mode) {
  const { id } = await tab()
  try {
    await chrome.scripting.executeScript({ target: { tabId: id }, func: (start) => { globalThis.__tokiStart = start }, args: [{ mode, rule }] })
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['engine.js', 'fill.js', 'infer.js', 'content.js'] })
    window.close()
  } catch {
    result('Formulário', '—', 'esta página não aceita extensões (páginas do navegador e da loja)', 'warn')
  }
}

// ---------- eventos ----------
for (const button of document.querySelectorAll('[data-rule]')) {
  button.addEventListener('click', async () => {
    rule = button.dataset.rule
    for (const other of document.querySelectorAll('[data-rule]')) other.setAttribute('aria-checked', String(other === button))
    await store.set('rule', rule)
    if (!$('#person').hidden) renderPerson()
  })
}
for (const button of document.querySelectorAll('[data-type]')) button.addEventListener('click', () => generate(button.dataset.type))
for (const button of document.querySelectorAll('[data-person]')) button.addEventListener('click', renderPerson)
for (const button of document.querySelectorAll('[data-back]')) button.addEventListener('click', () => show('home'))
document.querySelector('[data-more]').addEventListener('click', () => { renderTypes(); show('more'); $('#search').focus() })
document.querySelector('[data-action="fill"]').addEventListener('click', () => startForm('fill'))
document.querySelector('[data-action="capture"]').addEventListener('click', () => startForm('capture'))
$('#search').addEventListener('input', (event) => renderTypes(event.target.value))
$('#again').addEventListener('click', () => { if (last) generate(last.type) })
$('#copy').addEventListener('click', async () => {
  if (!last) return
  const ok = await copy(last.value)
  $('#result-note').textContent = ok ? 'copiado' : 'não foi possível copiar'
})
$('#open-toki').addEventListener('click', async () => chrome.tabs.create({ url: (await store.get('tokiUrl')) || DEFAULT_URL }))
$('#resend').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'toki:resend' }, (response) => {
    result('Captura', '—', response?.ok ? 'reenviada ao Toki' : (response?.error || 'não foi possível reenviar'), response?.ok ? 'ok' : 'warn')
  })
})
$('#url').addEventListener('change', async (event) => {
  const value = event.target.value.trim()
  if (value && !/^https?:\/\/\S+$/.test(value)) { event.target.setCustomValidity('Use http:// ou https://'); event.target.reportValidity(); return }
  event.target.setCustomValidity('')
  await store.set('tokiUrl', value)
})

// Diz de cara onde o valor vai entrar: o campo em foco na página ou, sem campo, só a área de transferência.
async function probe() {
  const text = $('#target-text')
  try {
    const { id } = await tab()
    await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['fill.js'] }).catch(() => chrome.scripting.executeScript({ target: { tabId: id }, files: ['fill.js'] }))
    const results = await chrome.scripting.executeScript({
      target: { tabId: id, allFrames: true },
      func: () => {
        let active = document.activeElement
        while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement
        if (!globalThis.TokiFill?.editable(active)) return null
        return String(active.getAttribute('aria-label') || active.labels?.[0]?.textContent || active.name || active.id || active.placeholder || 'campo').replace(/\s+/g, ' ').trim().slice(0, 60)
      },
    }).catch(() => [])
    const label = results.map((item) => item.result).find(Boolean)
    if (label) {
      $('#target').classList.add('on')
      text.replaceChildren(document.createTextNode('Vai inserir em '), Object.assign(document.createElement('b'), { textContent: `“${label}”` }))
    } else text.textContent = 'Nenhum campo selecionado: clique num campo da página e abra o menu de novo. Sem campo, o valor só é copiado.'
  } catch {
    text.textContent = 'Esta página não aceita extensões; os valores serão só copiados.'
  }
}
probe()

store.get('tokiUrl').then((value) => { $('#url').value = value || '' })
store.get('rule').then((value) => {
  if (value !== 'Válido' && value !== 'Inválido') return
  rule = value
  for (const other of document.querySelectorAll('[data-rule]')) other.setAttribute('aria-checked', String(other.dataset.rule === rule))
})
