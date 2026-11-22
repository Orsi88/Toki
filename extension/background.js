// Recebe a captura revisada e abre o Toki com ela no fragmento da URL (#/massa?captura=...).
// Sem endpoint local nem segredo: o fragmento não vai a servidor e o Toki só aplica depois da confirmação.
importScripts('infer.js')

const DEFAULT_URL = 'http://localhost:5173/'

async function tokiUrl() {
  const { tokiUrl: saved } = await chrome.storage.local.get('tokiUrl')
  return saved || DEFAULT_URL
}

async function open(payload) {
  const base = new URL(await tokiUrl())
  if (!/^https?:$/.test(base.protocol)) throw new Error('o endereço do Toki precisa começar com http:// ou https://')
  const encoded = TokiCapture.encodePayload(payload)
  if (encoded.length > TokiCapture.MAX_PARAM) throw new Error('a captura ficou grande demais; remova campos')
  base.hash = `/massa?captura=${encoded}`
  await chrome.storage.session.set({ lastPayload: payload })
  await chrome.tabs.create({ url: base.toString() })
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'toki:send' && message.payload?.source === 'toki-browser-extension') {
    open(message.payload).then(() => reply({ ok: true }), (error) => reply({ ok: false, error: error.message }))
    return true
  }
  if (message?.type === 'toki:resend' && !sender.tab) {
    chrome.storage.session.get('lastPayload')
      .then(({ lastPayload }) => { if (!lastPayload) throw new Error('nenhuma captura enviada nesta sessão'); return open(lastPayload) })
      .then(() => reply({ ok: true }), (error) => reply({ ok: false, error: error.message }))
    return true
  }
  return false
})
