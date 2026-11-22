// Toki · escrita em campos da página. Só roda quando a pessoa pede (inserir um valor ou preencher um formulário).
// Usa o setter nativo e dispara input/change, para que React, Vue e Angular registrem o valor. Nunca envia formulário.
(() => {
  if (globalThis.TokiFill) return

  const NOT_TEXT = new Set(['button', 'submit', 'reset', 'image', 'file', 'hidden', 'checkbox', 'radio', 'range'])
  const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

  function forInput(element, value) {
    const type = (element.getAttribute('type') || '').toLowerCase()
    const br = BR_DATE.exec(value)
    if (type === 'date' && br) return `${br[3]}-${br[2]}-${br[1]}`
    if (type === 'month' && br) return `${br[3]}-${br[2]}`
    if (type === 'datetime-local') {
      const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(value)
      if (iso) return iso[1]
      if (br) return `${br[3]}-${br[2]}-${br[1]}T12:00`
    }
    if (type === 'number') {
      const raw = value.replace(/[^\d,.-]/g, '')
      return raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
    }
    if (type === 'color' && /^#[0-9a-f]{6}/i.test(value)) return value.slice(0, 7)
    return value
  }

  function setNative(element, value) {
    const proto = Object.getPrototypeOf(element)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fill(element, value) {
    if (!element || element.disabled || element.readOnly) return false
    if (element.isContentEditable) {
      element.focus()
      document.execCommand('selectAll')
      document.execCommand('insertText', false, value)
      return true
    }
    if (element instanceof HTMLSelectElement) {
      const option = [...element.options].find((item) => item.textContent.trim() === value || item.value === value)
      if (!option) return false
      setNative(element, option.value)
      return true
    }
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      const on = /^(true|sim|1|yes|verdadeiro)$/i.test(String(value).trim())
      if (element.checked !== on) element.click()
      return true
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNative(element, forInput(element, String(value)))
      return true
    }
    return false
  }

  function focused() {
    let active = document.activeElement
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement
    return active
  }

  function editable(element) {
    if (!element || element.disabled || element.readOnly) return false
    return element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
      || (element instanceof HTMLInputElement && !NOT_TEXT.has(element.type))
  }

  function insertFocused(value) {
    const element = focused()
    if (!editable(element)) return { ok: false }
    const ok = fill(element, value)
    element.focus?.()
    const label = element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || element.name || element.id || element.tagName.toLowerCase()
    return { ok, label: String(label).replace(/\s+/g, ' ').slice(0, 60) }
  }

  globalThis.TokiFill = { fill, editable, insertFocused }
})()
