import { useEffect } from 'react'
import { encodePng } from '../domain/media.ts'
import { qrRaster } from '../domain/symbols.ts'
import { downloadBytes } from './browser.ts'
import { QrCode } from './EventPass.tsx'

export function QrDialog({ value, title = 'QR Code', onClose, onCopy }: { value: string; title?: string; onClose: () => void; onCopy: (value: string) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function save() {
    const raster = qrRaster(value, 4, 'M', 8)
    downloadBytes('qr-code.png', encodePng(new Uint8Array(raster.data.buffer), raster.width, raster.height, true), 'image/png')
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="viewer-card qr-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="preview-head">
          <h2>{title}</h2>
          <button type="button" className="ghost" aria-label="Fechar" onClick={onClose}>✕</button>
        </header>
        <QrCode value={value} size={260} label={title} />
        <div className="qr-content"><span>Conteúdo</span><code>{value}</code></div>
        <div className="row-actions">
          <button type="button" onClick={() => onCopy(value)}>Copiar conteúdo</button>
          <button type="button" onClick={save}>Baixar PNG</button>
        </div>
      </div>
    </div>
  )
}
