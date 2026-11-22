import type { GeneratedItem } from '../domain/export.ts'
import { displayValue } from '../domain/export.ts'
import { CopyButton } from './CopyButton.tsx'

const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const pad = (value: number) => String(value).padStart(2, '0')

type Reading = { time?: string; day?: number; month?: number; year?: number; weekday?: number; exists: boolean; utc: boolean }

// Lê o valor gerado sem corrigir nada: data inexistente (31/04) aparece como foi gerada, só sem dia da semana.
function read(text: string): Reading {
  const raw = text.trim()
  if (/^\d{9,13}$/.test(raw)) {
    const date = new Date(raw.length > 10 ? Number(raw) : Number(raw) * 1000)
    return { time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`, day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear(), weekday: date.getUTCDay(), exists: true, utc: true }
  }
  const time = /(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw)
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  const br = /(\d{2})\/(\d{2})\/(\d{4})/.exec(raw)
  let day: number | undefined
  let month: number | undefined
  let year: number | undefined
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (br) [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3])]
  let weekday: number | undefined
  let exists = true
  if (year && month && day) {
    const date = new Date(year, month - 1, day, 12)
    exists = date.getDate() === day && date.getMonth() === month - 1
    if (exists) weekday = date.getDay()
  }
  return { time: time ? `${time[1]}:${time[2]}${time[3] ? `:${time[3]}` : ''}` : undefined, day, month, year, weekday, exists, utc: false }
}

// Ficha de agendamento para Datas e horários: folhinha + data por extenso + horário, conforme o que foi gerado.
export function AppointmentCard({ item, onCopy }: { item: GeneratedItem; onCopy: (value: string) => void }) {
  const value = item.fields.find((field) => field.key === 'valor')?.v ?? item.fields[0]?.v ?? ''
  const r = read(value)
  const hasDate = Boolean(r.day && r.month && r.year)
  const monthName = r.month && r.month >= 1 && r.month <= 12 ? MONTHS[r.month - 1] : ''
  const longDate = hasDate
    ? `${r.weekday != null ? `${WEEK[r.weekday]}, ` : ''}${r.day} de ${monthName || `mês ${r.month}`} de ${r.year}`
    : ''
  return (
    <article className="appt">
      <header className="appt-head">
        <span>Agendamento · dados fictícios para testes</span>
        <span className={`tone ${item.tone}`}>{item.tag}</span>
      </header>
      <div className="appt-main">
        {hasDate ? (
          <div className="appt-cal" aria-hidden="true">
            <span className="appt-month">{monthName ? monthName.slice(0, 3) : pad(r.month!)}</span>
            <span className="appt-day">{pad(r.day!)}</span>
            <span className="appt-year">{r.year}</span>
          </div>
        ) : (
          <div className="appt-cal appt-clock" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
          </div>
        )}
        <div className="appt-info">
          {longDate ? <p className="appt-date">{longDate}{!r.exists ? <em> · data inexistente</em> : null}</p> : null}
          {r.time ? <p className="appt-time">{hasDate ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg> : null}{r.time}{r.utc ? <small> UTC</small> : null}</p> : null}
          <p className="appt-value">
            <code>{displayValue(value)}</code>
            <CopyButton label="Copiar valor" onCopy={() => onCopy(value)} />
          </p>
        </div>
      </div>
      {item.fields.filter((field) => field.key !== 'valor').length ? (
        <dl className="appt-rows">
          {item.fields.filter((field) => field.key !== 'valor').map((field) => (
            <div key={field.key}>
              <dt>{field.k}</dt>
              <dd>{displayValue(field.v)}<CopyButton label={`Copiar ${field.k}`} onCopy={() => onCopy(field.v)} /></dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}
