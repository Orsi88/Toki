// Tipos, regras e áreas de eventos, sem dependências: o motor lê isto ao carregar, antes de events.ts existir.

export type EventKind = 'Ingresso' | 'Credencial' | 'Inscrição' | 'Cupom'
export type Tone = 'ok' | 'bad' | 'warn'

export const EVENT_KINDS: EventKind[] = ['Ingresso', 'Credencial', 'Inscrição', 'Cupom']

export const EVENT_RULES: Record<EventKind, string[]> = {
  Ingresso: ['Válido', 'Já utilizado', 'Cancelado', 'Expirado', 'Outro evento', 'QR adulterado', 'Formato inválido'],
  Credencial: ['Válida', 'Área não autorizada', 'Vencida', 'Revogada', 'Outro evento', 'QR adulterado'],
  Inscrição: ['Válida', 'CPF inválido', 'E-mail inválido', 'Campo obrigatório ausente', 'Menor de idade', 'Pagamento pendente', 'Inscrição duplicada'],
  Cupom: ['Válido', 'Expirado', 'Ainda não vigente', 'Esgotado', 'Dígito inválido', 'Outro evento'],
}

export const EVENT_AREAS = ['Geral', 'Palco', 'Backstage', 'Imprensa', 'Camarim']
