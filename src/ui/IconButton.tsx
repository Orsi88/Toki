const PATHS = {
  copy: 'M9 9h10v11H9z M5 15V4h10',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19h14',
  image: 'M4 5h16v14H4z M4 15l4.5-4.5 4 4 3-3L20 15 M15.5 8.5h.01',
}

// Ação só com ícone: a dica aparece ao passar o mouse ou focar, e o leitor de tela lê o mesmo texto.
// "badge" marca o formato quando há mais de um (CSV, JSON…).
export function IconButton({ icon, tip, badge, primary, disabled, onClick }: {
  icon: keyof typeof PATHS
  tip: string
  badge?: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`icon-btn${primary ? ' on' : ''}`} aria-label={tip} data-tip={tip} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[icon]} /></svg>
      {badge ? <span className="icon-badge" aria-hidden="true">{badge}</span> : null}
    </button>
  )
}
