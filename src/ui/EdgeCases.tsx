import type { GeneratedItem } from '../domain/export.ts'
import { CopyButton } from './CopyButton.tsx'

const SHORT = 64

// Casos de borda como cartões de caso de teste: medida em destaque, resultado esperado e o valor para copiar.
export function EdgeCases({ items, onCopy }: { items: GeneratedItem[]; onCopy: (value: string) => void }) {
  return (
    <ol className="edge-cases">
      {items.slice(0, 12).map((item, index) => {
        const value = item.fields[0]?.v ?? ''
        const measure = item.fields.find((field) => field.key !== item.fields[0]?.key)
        const shown = value.length > SHORT ? `${value.slice(0, SHORT)}…` : value
        return (
          <li key={`${item.rule}-${index}`} className={`edge-case ${item.tone}`}>
            <div className="edge-top">
              <span className="edge-num">Caso {index + 1}</span>
              <span className={`tone ${item.tone}`}>{item.tag}</span>
            </div>
            {measure ? (
              <p className="edge-measure"><strong>{measure.v}</strong><span>{measure.k.toLocaleLowerCase('pt-BR')}</span></p>
            ) : null}
            <div className="edge-value">
              <code title={value.length > SHORT ? `${value.length} caracteres` : undefined}>{shown === '' ? '(vazio)' : shown}</code>
              <CopyButton label={`Copiar caso ${index + 1}`} onCopy={() => onCopy(value)} />
            </div>
            {value.length > SHORT ? <small className="edge-note">{value.length.toLocaleString('pt-BR')} caracteres; o copiar leva o valor inteiro.</small> : null}
          </li>
        )
      })}
    </ol>
  )
}
