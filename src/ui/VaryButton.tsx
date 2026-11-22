export function VaryButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="vary" disabled={disabled} onClick={onClick} aria-label="Gerar outro" data-tip={disabled ? 'Indisponível agora' : 'Gerar outro'}>
      <svg className="vary-dice" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <g transform="rotate(18 22 9)">
          <rect x="16" y="2.5" width="12" height="12" rx="2.4" fill="currentColor" />
          <circle cx="19.4" cy="5.9" r="1" fill="#fff" />
          <circle cx="24.6" cy="5.9" r="1" fill="#fff" />
          <circle cx="19.4" cy="11.1" r="1" fill="#fff" />
          <circle cx="24.6" cy="11.1" r="1" fill="#fff" />
        </g>
        <g transform="rotate(-16 10 22)">
          <rect x="2.5" y="14.5" width="15" height="15" rx="2.8" fill="currentColor" />
          <circle cx="6.6" cy="18.6" r="1.15" fill="#fff" />
          <circle cx="13.4" cy="18.6" r="1.15" fill="#fff" />
          <circle cx="10" cy="22" r="1.15" fill="#fff" />
          <circle cx="6.6" cy="25.4" r="1.15" fill="#fff" />
          <circle cx="13.4" cy="25.4" r="1.15" fill="#fff" />
        </g>
      </svg>
    </button>
  )
}
