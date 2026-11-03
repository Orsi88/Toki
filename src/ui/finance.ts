// Tipos da tela Financeiro e o motor de geração de cada um.
export const FINANCE_KINDS: Record<string, string> = { Cartão: 'cartao', PIX: 'pix', 'Dados bancários': 'bancario', Boleto: 'boleto' }

export function financeLabel(engine: string | null) {
  return Object.keys(FINANCE_KINDS).find((label) => FINANCE_KINDS[label] === engine) ?? 'Cartão'
}
