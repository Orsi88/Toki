import { useState, type ReactNode } from 'react'
import type { GeneratedItem } from '../domain/export.ts'
import { displayValue } from '../domain/export.ts'
import { mapEmbed } from '../domain/geo.ts'
import { parseColor } from '../domain/values.ts'
import { Barcode, QrMark } from './codes.tsx'
import { CopyButton } from './CopyButton.tsx'

type IdentityMeta = {
  first?: string
  last?: string
  age?: number | null
  cidade?: string
  uf?: string
  pais?: string
  nac?: string
}

function valueOf(item: GeneratedItem, key: string) {
  return item.fields.find((field) => field.key === key)?.v ?? ''
}

function columnsOf(items: GeneratedItem[]) {
  const keys: { key: string; label: string }[] = []
  for (const item of items) {
    for (const field of item.fields) {
      if (!keys.some((column) => column.key === field.key)) keys.push({ key: field.key, label: field.k })
    }
  }
  return keys
}

export function ValueResults({
  id,
  items,
  onCopy,
}: {
  id: string
  items: GeneratedItem[]
  onCopy: (value: string) => void
}) {
  if (items.length > 1) return <Sheet items={items} onCopy={onCopy} />
  const item = items[0]
  if (!item) return null
  if (id === 'cartao') return <PlasticCard item={item} onCopy={onCopy} />
  if (id === 'boleto') return <BoletoSlip item={item} onCopy={onCopy} />
  if (id === 'identidade') return <IdentityCard item={item} onCopy={onCopy} />
  return <FieldStack item={item} onCopy={onCopy} />
}

function FieldStack({ item, onCopy }: { item: GeneratedItem; onCopy: (value: string) => void }) {
  return (
    <div className="stack">
      <p><span className={`tone ${item.tone}`}>{item.tag}</span></p>
      {item.fields.map((field) => (
        <div key={field.key} className="copy-row">
          <span>{field.k}</span>
          <strong>{parseColor(field.v) && field.key === 'valor' ? <i className="swatch" style={{ background: field.v }} /> : null}{displayValue(field.v)}</strong>
          <CopyButton label={`Copiar ${field.k}`} onCopy={() => onCopy(field.v)} />
        </div>
      ))}
      {item.checks?.length ? <p className="muted">{item.checks.map((check) => check[0]).join(' · ')}</p> : null}
    </div>
  )
}

function PlasticCard({ item, onCopy }: { item: GeneratedItem; onCopy: (value: string) => void }) {
  const brand = valueOf(item, 'bandeira')
  const number = valueOf(item, 'numero_cartao')
  const holder = valueOf(item, 'titular')
  const expiry = valueOf(item, 'validade')
  const cvv = valueOf(item, 'cvv')
  const product = valueOf(item, 'produto') || 'Crédito'
  return (
    <div className="stack">
      <div className="plastic">
        <div className="plastic-top">
          <span className="chip-gold" />
          <div className="plastic-brand-block">
            <strong className="plastic-brand">
              {brand}
              <CopyButton label="Copiar bandeira" onCopy={() => onCopy(brand)} />
            </strong>
            <span className="plastic-kind">
              {product}
              <CopyButton label="Copiar produto" onCopy={() => onCopy(product)} />
            </span>
          </div>
        </div>
        <p className="plastic-number">
          <span>{number || '••••'}</span>
          <CopyButton label="Copiar número" onCopy={() => onCopy(number)} />
        </p>
        <div className="plastic-bottom">
          <label>Titular<strong>{holder}<CopyButton label="Copiar titular" onCopy={() => onCopy(holder)} /></strong></label>
          <label>Validade<strong>{expiry}<CopyButton label="Copiar validade" onCopy={() => onCopy(expiry)} /></strong></label>
          <label>CVV<strong>{cvv}<CopyButton label="Copiar CVV" onCopy={() => onCopy(cvv)} /></strong></label>
        </div>
      </div>
      <p><span className={`tone ${item.tone}`}>{item.tag}</span></p>
      {item.checks?.length ? <p className="muted">{item.checks.map((check) => check[0]).join(' · ')}</p> : null}
    </div>
  )
}

function SlipCell({ label, children, className = '' }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`boleto-cell ${className}`.trim()}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}

function BoletoSlip({ item, onCopy }: { item: GeneratedItem; onCopy: (value: string) => void }) {
  const linha = valueOf(item, 'linha')
  const barras = valueOf(item, 'codigo_barras')
  const banco = valueOf(item, 'banco')
  const bankName = banco.split('·')[1]?.trim() || banco
  const codigo = valueOf(item, 'codigo_banco')
  const cedente = valueOf(item, 'cedente')
  const agencia = valueOf(item, 'agencia')
  const beneficiario = valueOf(item, 'codigo_beneficiario')
  const pagador = valueOf(item, 'pagador')
  const cpf = valueOf(item, 'cpf')
  const endereco = valueOf(item, 'endereco')
  const nosso = valueOf(item, 'nosso_numero')
  const vencimento = valueOf(item, 'vencimento')
  const valor = valueOf(item, 'valor')
  const carteira = valueOf(item, 'carteira')
  const dataDoc = valueOf(item, 'data_documento')
  const numeroDoc = valueOf(item, 'numero_documento')
  const payload = valueOf(item, 'payload')
  return (
    <div className="stack">
      <article className="boleto">
        <p className="boleto-cut">Corte na linha pontilhada</p>
        <header className="boleto-head">
          <strong className="boleto-bank">{bankName}</strong>
          <b className="boleto-dv">{codigo}</b>
          <p className="boleto-line">
            <span>{linha}</span>
            <CopyButton label="Copiar linha digitável" onCopy={() => onCopy(linha)} />
          </p>
        </header>
        <div className="boleto-sheet">
          <SlipCell label="Local de pagamento" className="wide">Pagável em qualquer banco</SlipCell>
          <SlipCell label="Vencimento">{vencimento}<CopyButton label="Copiar vencimento" onCopy={() => onCopy(vencimento)} /></SlipCell>
          <SlipCell label="Beneficiário" className="wide">{cedente}<CopyButton label="Copiar cedente" onCopy={() => onCopy(cedente)} /></SlipCell>
          <SlipCell label="Agência / Código do beneficiário">{agencia} / {beneficiario}<CopyButton label="Copiar agência" onCopy={() => onCopy(`${agencia} / ${beneficiario}`)} /></SlipCell>
          <SlipCell label="Data do documento">{dataDoc}</SlipCell>
          <SlipCell label="Nº do documento">{numeroDoc}</SlipCell>
          <SlipCell label="Espécie doc.">DM</SlipCell>
          <SlipCell label="Aceite">N</SlipCell>
          <SlipCell label="Data do processamento">{dataDoc}</SlipCell>
          <SlipCell label="Nosso número">{nosso}<CopyButton label="Copiar nosso número" onCopy={() => onCopy(nosso)} /></SlipCell>
          <SlipCell label="Uso do banco" />
          <SlipCell label="Carteira">{carteira}</SlipCell>
          <SlipCell label="Espécie">R$</SlipCell>
          <SlipCell label="Quantidade" />
          <SlipCell label="Valor" />
          <SlipCell label="(=) Valor do documento">{valor}<CopyButton label="Copiar valor" onCopy={() => onCopy(valor)} /></SlipCell>
          <div className="boleto-instr">
            <span>Instruções</span>
            <p>Documento sintético para teste. Não receber e não está registrado.</p>
            <div className="boleto-payer">
              <span>Pagador</span>
              <strong>
                {pagador}
                <CopyButton label="Copiar pagador" onCopy={() => onCopy(pagador)} />
              </strong>
              <em>CPF {cpf}</em>
              <p>{endereco}</p>
            </div>
          </div>
          <div className="boleto-side">
            <SlipCell label="(-) Desconto / Abatimento" />
            <SlipCell label="(+) Mora / Multa" />
            <SlipCell label="(=) Valor cobrado" />
            <div className="boleto-pix">
              <QrMark value={payload} />
              <span>
                PIX
                <CopyButton label="Copiar QR Code PIX" onCopy={() => onCopy(payload)} />
              </span>
            </div>
          </div>
        </div>
        <footer className="boleto-foot">
          <Barcode digits={barras} />
          <CopyButton label="Copiar código de barras" onCopy={() => onCopy(barras)} />
          <em>Ficha de compensação</em>
        </footer>
      </article>
      <p><span className={`tone ${item.tone}`}>{item.tag}</span></p>
      {item.checks?.length ? <p className="muted">{item.checks.map((check) => check[0]).join(' · ')}</p> : null}
    </div>
  )
}

function IdentityCard({ item, onCopy }: { item: GeneratedItem; onCopy: (value: string) => void }) {
  const meta = (item as GeneratedItem & { meta?: IdentityMeta }).meta
  const name = [meta?.first, meta?.last].filter(Boolean).join(' ') || valueOf(item, 'nome') || 'Identidade fictícia'
  const parts = name.split(' ').filter(Boolean)
  const initials = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''}`.toUpperCase()
  const place = [meta?.cidade, meta?.uf || meta?.pais].filter(Boolean).join(' – ')
  const sub = [meta?.age != null ? `${meta.age} anos` : '', meta?.nac, place].filter(Boolean).join(' · ')
  return (
    <article className="id-card">
      <header>
        <span>Dados fictícios — uso em testes</span>
      </header>
      <div className="id-person">
        <b>{initials || 'MF'}</b>
        <div>
          <h3>
            {name}
            <CopyButton label="Copiar nome" onCopy={() => onCopy(name)} />
          </h3>
          {sub ? <p>{sub}</p> : null}
        </div>
      </div>
      <div className="id-grid">
        {item.fields.map((field) => (
          <div key={field.key}>
            <span>{field.k}<CopyButton label={`Copiar ${field.k}`} onCopy={() => onCopy(field.v)} /></span>
            <strong>{displayValue(field.v)}</strong>
          </div>
        ))}
      </div>
    </article>
  )
}

function Sheet({ items, onCopy }: { items: GeneratedItem[]; onCopy: (value: string) => void }) {
  const columns = columnsOf(items)
  const visible = items.slice(0, 100)
  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <thead>
          <tr>
            <th>#</th>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            <th>Regra</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((item, index) => (
            <tr key={`${item.rule}-${index}`}>
              <td className="num">{String(index + 1).padStart(2, '0')}</td>
              {columns.map((column) => {
                const value = valueOf(item, column.key)
                return (
                  <td key={column.key}>
                    <span className="cell">
                      <button type="button" className="cell-hit" title="Clique para copiar" onClick={() => onCopy(value)}>{displayValue(value)}</button>
                      <CopyButton label={`Copiar ${column.label}`} onCopy={() => onCopy(value)} />
                    </span>
                  </td>
                )
              })}
              <td><span className={`tone ${item.tone}`}>{item.tag}</span></td>
              <td>
                <CopyButton
                  label={`Copiar linha ${index + 1}`}
                  onCopy={() => onCopy(item.fields.map((field) => field.v).join('\t'))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > visible.length ? <p className="muted">Exibindo {visible.length} de {items.length}. Baixar CSV inclui todos.</p> : null}
    </div>
  )
}

export function CoordinateMap({ items }: { items: GeneratedItem[] }) {
  const [index, setIndex] = useState(0)
  const current = Math.min(index, Math.max(items.length - 1, 0))
  const item = items[current]
  const link = item ? valueOf(item, 'mapa') : ''
  const src = mapEmbed(link)
  const value = item ? valueOf(item, 'valor') : ''
  return (
    <div className="map-section">
      {items.length > 1 ? (
        <label className="field map-line">
          <span>Linha</span>
          <select value={current} onChange={(event) => setIndex(Number(event.target.value))}>
            {items.map((row, rowIndex) => (
              <option key={`${row.rule}-${rowIndex}`} value={rowIndex}>
                {String(rowIndex + 1).padStart(2, '0')} · {valueOf(row, 'valor')}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {src ? <iframe className="map-frame" title={`Mapa da linha ${current + 1}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <p className="muted">{link || 'Sem coordenada para abrir no mapa.'}</p>}
      {item ? <p className="muted">Linha {String(current + 1).padStart(2, '0')} · {value} · {item.tag}</p> : null}
    </div>
  )
}
