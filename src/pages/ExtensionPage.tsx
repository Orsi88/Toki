import JSZip from 'jszip'
import { useState } from 'react'
import { copyText, downloadBlob, downloadNotice, type Notice } from '../ui/browser.ts'

// A extensão pronta (npm run build:extension → dist-extension/) entra no Toki como texto e vira .zip no navegador.
// Se a pasta não existir ainda, o glob vem vazio e o botão explica o que falta.
const TEXT = import.meta.glob('/dist-extension/*.{js,json,html,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const BINARY = import.meta.glob('/dist-extension/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const READY = Object.keys(TEXT).some((path) => path.endsWith('/engine.js'))
const EXTENSIONS_PAGE = 'chrome://extensions'

const TOOLS: { label: string; d: string }[] = [
  { label: 'Pessoa', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5' },
  { label: 'CPF', d: 'M3 6h18v12H3z M7 10.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0 M6 15c.5-1.3 1.5-2 2.5-2s2 .7 2.5 2 M14 10h4 M14 14h3' },
  { label: 'CNPJ', d: 'M4 20V6l7-3v17 M11 9h9v11 M2 20h20 M15 13h1 M15 16h1' },
  { label: 'E-mail', d: 'M3 6h18v12H3z M3 7l9 6 9-6' },
  { label: 'Telefone', d: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2' },
  { label: 'CEP', d: 'M12 21s-6-5.4-6-11a6 6 0 1 1 12 0c0 5.6-6 11-6 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  { label: 'Endereço', d: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5' },
  { label: 'Data', d: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4' },
  { label: 'Cartão', d: 'M3 6h18v12H3z M3 10h18 M7 15h3' },
  { label: 'PIX', d: 'M12 3l9 9-9 9-9-9z M8.5 12h7 M12 8.5v7' },
  { label: 'UUID', d: 'M9 4L7 20 M17 4l-2 16 M4 9h16 M3 15h16' },
  { label: 'Mais', d: 'M5 5h4v4H5z M15 5h4v4h-4z M5 15h4v4H5z M15 15h4v4h-4z' },
]

function Glyph({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
}

function MenuPreview() {
  return (
    <div className="ext-menu" aria-hidden="true">
      <div className="ext-menu-top">
        <img src="/logo.png" alt="" />
        <b>Toki</b>
        <span className="ext-seg"><i>Válido</i><span>Inválido</span></span>
      </div>
      <div className="ext-wide"><Glyph d="M5 4h10l4 4v12H5z M14 4v5h5 M8 13h8 M8 17h5" /><span><b>Preencher formulário</b><small>Escolha o bloco e preenche tudo</small></span></div>
      <div className="ext-wide"><Glyph d="M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M8 10h8 M8 14h5" /><span><b>Capturar para a massa</b><small>Leva as colunas ao Toki</small></span></div>
      <div className="ext-grid">
        {TOOLS.map((tool) => <span key={tool.label}><Glyph d={tool.d} />{tool.label}</span>)}
      </div>
    </div>
  )
}

export function ExtensionPage({ onToast }: { onToast: (message: string | Notice, bad?: boolean) => void }) {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder('toki-extensao')!
      for (const [path, text] of Object.entries(TEXT)) folder.file(path.split('/').pop()!, text)
      await Promise.all(Object.entries(BINARY).map(async ([path, url]) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`${path}: ${response.status}`)
        folder.file(path.split('/').pop()!, await response.arrayBuffer())
      }))
      downloadBlob('toki-extensao.zip', await zip.generateAsync({ type: 'blob' }))
      onToast(downloadNotice())
    } catch (error) {
      onToast({ title: 'Não foi possível montar o .zip', detail: (error as Error).message, bad: true }, true)
    } finally {
      setBusy(false)
    }
  }

  async function copyAddress() {
    const ok = await copyText(EXTENSIONS_PAGE)
    onToast(ok ? 'Copiado. Cole numa nova aba.' : 'Não foi possível copiar.', !ok)
  }

  return (
    <div className="ext-page">
      <section className="ext-hero">
        <div className="ext-copy">
          <h1>O Toki dentro do navegador</h1>
          <p>Gere CPF, e-mail, pessoa completa e outros dados direto no campo em que você está, preencha um formulário inteiro em um clique ou leve a estrutura dele para a Massa Personalizada. Funciona em qualquer site, no Chrome, Edge e Brave.</p>
          <div className="ext-cta">
            <button type="button" className="primary" disabled={busy || !READY} onClick={download}>
              {busy ? 'Montando o .zip…' : 'Baixar extensão'}
            </button>
            <span className="ext-kbd">Atalho: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd></span>
          </div>
          {!READY ? <p className="banner">A extensão ainda não foi montada neste Toki. Rode <code>npm run build:extension</code> e recarregue a página.</p> : null}
        </div>
        <MenuPreview />
      </section>

      <section className="ext-section" aria-labelledby="ext-install">
        <h2 id="ext-install">Como ativar (uma vez só)</h2>
        <ol className="ext-steps">
          <li><b>Extraia o .zip</b><span>Numa pasta que vai continuar existindo, como Documentos. O navegador carrega a extensão dali.</span></li>
          <li>
            <b>Abra a página de extensões</b>
            <span>Cole <code>{EXTENSIONS_PAGE}</code> numa nova aba (no Edge, <code>edge://extensions</code>). Sites não podem abrir esse endereço sozinhos.</span>
            <button type="button" className="ghost" onClick={copyAddress}>Copiar endereço</button>
          </li>
          <li><b>Ligue o Modo do desenvolvedor</b><span>Chave no canto superior direito (no Edge, na barra lateral).</span></li>
          <li><b>Carregar sem compactação</b><span>Escolha a pasta <code>toki-extensao</code> extraída e fixe o ícone do Toki na barra pelo ícone de quebra-cabeça.</span></li>
        </ol>
      </section>

      <section className="ext-section" aria-labelledby="ext-use">
        <h2 id="ext-use">Como usar</h2>
        <div className="ext-cards">
          <article>
            <Glyph d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
            <h3>Inserir num campo</h3>
            <p>Clique no campo da página, abra o menu e escolha o dado. Ele entra no campo e fica copiado. <b>Pessoa</b> traz nome, CPF, e-mail e endereço da mesma pessoa.</p>
          </article>
          <article>
            <Glyph d="M5 4h10l4 4v12H5z M14 4v5h5 M8 13h8 M8 17h5" />
            <h3>Preencher formulário</h3>
            <p>Escolha o bloco com o mouse (↑ amplia, Esc cancela). Tudo é preenchido de uma vez, com senha e confirmação iguais, datas em ordem e um arquivo de exemplo nos campos de upload (do tipo que o campo aceita). O formulário não é enviado.</p>
          </article>
          <article>
            <Glyph d="M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M8 10h8 M8 14h5" />
            <h3>Capturar para a massa</h3>
            <p>Revise os campos e envie: a Massa Personalizada abre com as colunas prontas para gerar lotes. Só a estrutura vai, nunca o que está digitado.</p>
          </article>
        </div>
        <p className="muted">
          <b>Válido / Inválido</b> no topo do menu vale para tudo. Páginas internas do navegador e a loja de extensões não aceitam extensões.
          A captura abre o Toki em {window.location.origin}; se for outro endereço, ajuste em ⚙ no menu.
          Ao atualizar o Toki, baixe de novo, substitua a pasta e clique em recarregar (↻) no card da extensão.
        </p>
      </section>
    </div>
  )
}
