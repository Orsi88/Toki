import { useEffect, useState } from 'react'
import type { Notice } from '../ui/browser.ts'
import { FINANCE_KINDS, financeLabel } from '../ui/finance.ts'
import { TypePicker } from '../ui/TypePicker.tsx'
import { GeneratorPage } from './GeneratorPage.tsx'

// Cartão, PIX, dados bancários e boleto numa tela só: o tipo escolhido no topo abre o gerador dele logo abaixo.
const HELP: Record<string, string> = {
  Cartão: 'Luhn, bandeira, validade e CVV.',
  PIX: 'Chaves e copia e cola com CRC16.',
  'Dados bancários': 'Banco, agência, conta e dígito.',
  Boleto: 'Linha digitável, código de barras e QR.',
}

const OPTIONS = Object.entries(FINANCE_KINDS).map(([label, engine]) => ({ value: label, label, desc: HELP[label], icon: engine }))

export function FinancePage({ query, onToast }: { query: URLSearchParams; onToast: (message: string | Notice, bad?: boolean) => void }) {
  const [tipo, setTipo] = useState(() => financeLabel(query.get('tipo')))
  const engine = FINANCE_KINDS[tipo]

  // O tipo fica na URL para o link e a aba Validar abrirem no mesmo tipo.
  useEffect(() => {
    const next = `#/financeiro?tipo=${engine}`
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [engine])

  return (
    <div className="work">
      <section className="step">
        <header className="step-title">
          <b>1</b>
          <div>
            <h2>Escolha o tipo</h2>
            <p>As opções abaixo mudam conforme o tipo.</p>
          </div>
        </header>
        <TypePicker label="Tipo" options={OPTIONS} value={tipo} onChange={setTipo} />
      </section>
      <GeneratorPage key={engine} id={engine} query={new URLSearchParams()} onToast={onToast} firstStep={2} />
    </div>
  )
}
