export function ClearButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="clear" disabled={disabled} onClick={onClick} aria-label="Limpar configurações e prévia" title="Limpar configurações e prévia">
      <svg className="clear-broom" width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path className="clear-spark" fill="currentColor" d="M15.2 16.4 16.8 20l3.6 1.3-3.6 1.3-1.6 3.6-1.6-3.6-3.6-1.3 3.6-1.3z" />
        <path className="clear-spark" fill="currentColor" d="M7.4 32.2 8.5 34.8l2.6.9-2.6.9-1.1 2.6-1.1-2.6-2.6-.9 2.6-.9z" />
        <path className="clear-spark" fill="currentColor" d="M23.6 8.4 24.6 11l2.6.9-2.6.9-1 2.6-1-2.6-2.6-.9 2.6-.9z" />
        <path stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" d="M47 6.5c2.2 9.5.4 17.5-5.6 23.2-2.4 2.3-5.6 3.5-8.2 3.6" />
        <path stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" d="M20.5 36.5c-3.6 7.4-8.8 13.6-15 17.4" />
        <path stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" d="M24.6 35.4c-1.8 8.2-5.4 15.2-10.2 19.6" />
        <path stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" d="M29.2 34.8c.2 8.4-2.2 15.8-6.2 20.4" />
        <path stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" d="M33.8 34.6c2 8 1.2 15.4-1.6 20" />
        <path stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" d="M38.2 35.2c3.6 7.2 3.8 14.2 1.8 18.6" />
        <path stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" d="M18.8 35.2c6.4-2.4 16.6-2.6 22.2 1.6" />
        <path stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" opacity="0.55" d="M12 50.5c9.5 4.6 19.5 3.2 27.5-2.8" />
      </svg>
    </button>
  )
}
