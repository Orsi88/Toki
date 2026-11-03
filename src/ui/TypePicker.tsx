import { TypeIcon } from './Icons.tsx'

export type TypeOption = { value: string; label: string; desc?: string; icon: string }

const VISIBLE = 4

// Opções sempre visíveis em vez de uma lista suspensa. Com mais de 4, as principais ficam à mostra
// e o quarto cartão, "Outros", abre a lista com o resto e passa a mostrar a escolhida.
export function TypePicker({ label, options, value, onChange, main }: { label: string; options: TypeOption[]; value: string; onChange: (value: string) => void; main?: string[] }) {
  const overflow = options.length > VISIBLE
  const featured = !overflow ? options : (main?.length ? options.filter((option) => main.includes(option.value)) : options.slice(0, VISIBLE - 1)).slice(0, VISIBLE - 1)
  const rest = overflow ? options.filter((option) => !featured.includes(option)) : []
  const other = rest.find((option) => option.value === value)

  return (
    <div className="type-picker" role="radiogroup" aria-label={label}>
      {featured.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="type-option"
          onClick={() => onChange(option.value)}
        >
          <span className="type-icon"><TypeIcon name={option.icon} /></span>
          <span className="type-text">
            <strong>{option.label}</strong>
            {option.desc ? <small>{option.desc}</small> : null}
          </span>
        </button>
      ))}
      {rest.length ? (
        <label className="type-option type-more" aria-checked={Boolean(other)} role="radio">
          <span className="type-icon"><TypeIcon name={other?.icon ?? 'outros'} /></span>
          <span className="type-text">
            <strong>{other?.label ?? 'Outros'}</strong>
            <small>{other ? 'Trocar por outro tipo' : `Mais ${rest.length} ${rest.length === 1 ? 'opção' : 'opções'}`}</small>
          </span>
          <svg className="type-caret" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <select aria-label={`Outros: ${label}`} value={other?.value ?? ''} onChange={(event) => onChange(event.target.value)}>
            {!other ? <option value="" disabled>Escolha</option> : null}
            {rest.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  )
}
