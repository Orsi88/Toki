import { useEffect, useState } from 'react'
import { copyText } from './browser.ts'
import { QrCode } from './EventPass.tsx'
import { lanAddresses, relayAvailable } from './scan.ts'

export function ScanDialog({ session, category, connected, received, onClose }: { session: string; category: string; connected: boolean; received: number; onClose: () => void }) {
  const [view, setView] = useState<'QR Code' | 'Link'>('QR Code')
  const [lan, setLan] = useState<{ ips: string[]; port: number } | null>(null)
  const [ip, setIp] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    lanAddresses().then((result) => {
      setLan(result)
      setIp(result.ips[0] ?? '')
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const link = ip && lan ? `http://${ip}:${lan.port}/#/scan?s=${session}&c=${category}` : ''

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Escanear com o celular" onClick={onClose}>
      <div className="viewer-card scan-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="preview-head">
          <h2>Escanear com o celular</h2>
          <button type="button" className="ghost" aria-label="Fechar" onClick={onClose}>✕</button>
        </header>
        {!relayAvailable ? (
          <p className="banner bad">O leitor pelo celular só funciona com o app rodando em npm run dev: é o servidor de desenvolvimento que repassa as leituras.</p>
        ) : !lan ? (
          <p className="muted">Procurando o endereço deste computador na rede...</p>
        ) : !link ? (
          <p className="banner bad">Este computador não está numa rede local. Conecte o celular e o computador no mesmo Wi-Fi.</p>
        ) : (
          <>
            <p className="muted">Celular e computador no mesmo Wi-Fi. Abra a página de leitura no celular; cada código lido cai na caixa do validador aqui.</p>
            <div className="seg scan-toggle" role="group" aria-label="Mostrar">
              {(['QR Code', 'Link'] as const).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>
              ))}
            </div>
            {view === 'QR Code' ? (
              <div className="scan-qr">
                <QrCode value={link} size={240} label="QR Code da página de leitura" />
                <small>Aponte a câmera do celular para abrir.</small>
              </div>
            ) : (
              <div className="scan-link">
                <code>{link}</code>
                <button type="button" onClick={async () => { setCopied(await copyText(link)) }}>{copied ? 'Link copiado' : 'Copiar link'}</button>
                <small>Mande para o celular (WhatsApp, e-mail) ou digite no navegador dele.</small>
              </div>
            )}
            {lan.ips.length > 1 ? (
              <label className="field">
                <span>Rede</span>
                <select value={ip} onChange={(event) => setIp(event.target.value)}>
                  {lan.ips.map((address) => <option key={address}>{address}</option>)}
                </select>
              </label>
            ) : null}
            <p className={connected ? 'scan-status on' : 'scan-status'}>
              {connected ? `Celular conectado · ${received} ${received === 1 ? 'leitura recebida' : 'leituras recebidas'}` : 'Aguardando o celular abrir a página...'}
            </p>
            <small className="muted">Se o celular não abrir a página, o Windows pode estar bloqueando o Node no firewall: libere o acesso em rede privada.</small>
          </>
        )}
      </div>
    </div>
  )
}
