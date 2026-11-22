import type { CSSProperties } from 'react'
import { TypeIcon } from './Icons.tsx'

// Colunas que equilibram as linhas: até 6 numa linha; acima disso, linhas do mesmo tamanho (10 → 5 + 5, 13 → 5 + 5 + 3).
function balanced(count: number) {
  if (count <= 6) return count
  return Math.ceil(count / Math.ceil(count / 6))
}

export type StripItem = { value: string; label: string; icon: string; hint?: string }
export type StripGroup = { label?: string; items: StripItem[] }

// Escolha do tipo no topo da tela: cartões com ícone, nome e uma linha de descrição, soltos na página
// (sem cartão de seção em volta) e agrupados quando faz sentido.
export function TypeStrip({ label, groups, value, onChange }: { label: string; groups: StripGroup[]; value: string; onChange: (value: string) => void }) {
  return (
    <nav className="type-strip" aria-label={label}>
      {groups.map((group, index) => (
        <section
          className="type-strip-group"
          key={group.label ?? index}
          aria-label={group.label}
          style={{ '--grow': groups.length > 1 ? group.items.length : 1 } as CSSProperties}
        >
          {group.label ? <h2 className="type-strip-label">{group.label}</h2> : null}
          <div className="type-strip-grid" style={{ '--cols': balanced(group.items.length) } as CSSProperties}>
            {group.items.map((item) => (
              <button
                key={item.value}
                type="button"
                className="type-option"
                aria-pressed={item.value === value}
                onClick={() => onChange(item.value)}
              >
                <span className="type-icon"><TypeIcon name={item.icon} /></span>
                <span className="type-text">
                  <strong>{item.label}</strong>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}
