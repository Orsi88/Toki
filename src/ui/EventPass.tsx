import { create } from 'qrcode'
import { fieldOf, type EventKind, type EventRow } from '../domain/events.ts'

export function QrCode({ value, size = 160, label = 'QR Code' }: { value: string; size?: number; label?: string }) {
  const qr = create(value, { errorCorrectionLevel: 'M' })
  const count = qr.modules.size
  const cells: string[] = []
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.modules.get(row, col)) cells.push(`M${col + 2} ${row + 2}h1v1h-1z`)
  }
  return (
    <svg className="qr-code" viewBox={`0 0 ${count + 4} ${count + 4}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={count + 4} height={count + 4} fill="#fff" />
      <path d={cells.join('')} fill="#111" />
    </svg>
  )
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  if (!value) return null
  return (
    <div className={wide ? 'pass-info wide' : 'pass-info'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Ticket({ item }: { item: EventRow }) {
  const get = (key: string) => fieldOf(item, key)
  const seat = get('assento')
  return (
    <div className="pass ticket">
      <div className="ticket-main">
        <p className="pass-kicker">{get('organizador') || 'Ingresso'}</p>
        <h3>{get('nome_evento')}</h3>
        <p className="pass-when">{get('data')} · {get('horario')}</p>
        <p className="pass-where">{[get('local'), get('cidade')].filter(Boolean).join(' · ')}</p>
        <div className="pass-grid">
          <Info label="Setor" value={get('setor')} />
          <Info label="Assento" value={seat === '-' ? 'Livre' : seat} />
          <Info label="Tipo" value={get('tipo')} />
          <Info label="Valor" value={get('preco')} />
          <Info label="Titular" value={get('titular')} wide />
        </div>
      </div>
      <div className="ticket-stub">
        <QrCode value={get('qr')} size={150} label={`QR Code do ingresso ${get('codigo')}`} />
        <code>{get('codigo')}</code>
        <small>Apresente na entrada</small>
      </div>
    </div>
  )
}

function Badge({ item }: { item: EventRow }) {
  const get = (key: string) => fieldOf(item, key)
  return (
    <div className="pass badge">
      <p className="pass-kicker">{get('nome_evento')}</p>
      <div className={`badge-role role-${get('funcao').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`}>{get('funcao')}</div>
      <h3>{get('nome')}</h3>
      <QrCode value={get('qr')} size={150} label={`QR Code da credencial ${get('codigo')}`} />
      <div className="badge-areas">{get('areas').split(', ').map((area) => <span key={area}>{area}</span>)}</div>
      <p className="pass-where">Válida até {get('valida_ate')} · <code>{get('codigo')}</code></p>
    </div>
  )
}

function Receipt({ item }: { item: EventRow }) {
  const get = (key: string) => fieldOf(item, key)
  return (
    <div className="pass receipt">
      <p className="pass-kicker">Comprovante de inscrição</p>
      <h3>{get('nome_evento')}</h3>
      <div className="pass-grid">
        <Info label="Inscrição" value={get('inscricao')} />
        <Info label="Categoria" value={get('categoria')} />
        <Info label="Nome" value={get('nome') || '(vazio)'} wide />
        <Info label="CPF" value={get('cpf')} />
        <Info label="Nascimento" value={get('nascimento')} />
        <Info label="E-mail" value={get('email')} wide />
        <Info label="Valor" value={get('valor')} />
        <Info label="Pagamento" value={get('pagamento')} />
      </div>
    </div>
  )
}

function Voucher({ item }: { item: EventRow }) {
  const get = (key: string) => fieldOf(item, key)
  return (
    <div className="pass voucher">
      <div className="voucher-main">
        <p className="pass-kicker">{get('nome_evento')}</p>
        <strong className="voucher-off">{get('desconto')} <small>de desconto</small></strong>
        <code className="voucher-code">{get('cupom')}</code>
        <p className="pass-where">De {get('inicio')} a {get('fim')} · {get('usos')} de {get('limite')} usos</p>
      </div>
      <QrCode value={get('qr')} size={130} label={`QR Code do cupom ${get('cupom')}`} />
    </div>
  )
}

export function EventPass({ item, tipo }: { item: EventRow; tipo: EventKind }) {
  if (tipo === 'Credencial') return <Badge item={item} />
  if (tipo === 'Inscrição') return <Receipt item={item} />
  if (tipo === 'Cupom') return <Voucher item={item} />
  return <Ticket item={item} />
}
