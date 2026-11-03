import { create } from 'qrcode'

const ITF: Record<string, string> = {
  '0': 'nnwwn',
  '1': 'wnnnw',
  '2': 'nwnnw',
  '3': 'wwnnn',
  '4': 'nnwnw',
  '5': 'wnwnn',
  '6': 'nwwnn',
  '7': 'nnnww',
  '8': 'wnnwn',
  '9': 'nwnwn',
}

function itfModules(digits: string) {
  const data = digits.length % 2 ? `0${digits}` : digits
  const narrow = 1
  const wide = 3
  const out: { on: boolean; width: number }[] = [
    { on: true, width: narrow },
    { on: false, width: narrow },
    { on: true, width: narrow },
    { on: false, width: narrow },
  ]
  for (let i = 0; i < data.length; i += 2) {
    const bars = ITF[data[i]]
    const spaces = ITF[data[i + 1]]
    if (!bars || !spaces) return []
    for (let j = 0; j < 5; j++) {
      out.push({ on: true, width: bars[j] === 'w' ? wide : narrow })
      out.push({ on: false, width: spaces[j] === 'w' ? wide : narrow })
    }
  }
  out.push({ on: true, width: wide }, { on: false, width: narrow }, { on: true, width: narrow })
  return out
}

export function Barcode({ digits }: { digits: string }) {
  const clean = digits.replace(/\D/g, '')
  const mods = clean ? itfModules(clean) : []
  if (!mods.length) return null
  let x = 12
  const marks = mods.flatMap((mod, index) => {
    const mark = mod.on ? <rect key={index} x={x} y="0" width={mod.width} height="70" /> : null
    x += mod.width
    return mark ? [mark] : []
  })
  return (
    <svg className="boleto-bars" viewBox={`0 0 ${x + 12} 70`} preserveAspectRatio="none" role="img" aria-label="Código de barras">
      {marks}
    </svg>
  )
}

export function QrMark({ value, label = 'QR Code do PIX sintético' }: { value: string; label?: string }) {
  const qr = create(value, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const cells = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) cells.push(<rect key={`${col}-${row}`} x={col} y={row} width="1" height="1" />)
    }
  }
  return (
    <svg className="boleto-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {cells}
    </svg>
  )
}
