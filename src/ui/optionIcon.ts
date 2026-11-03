// O ícone de uma opção sai do próprio nome dela ("Data e hora" → data_e_hora), com alguns apelidos.
const ALIASES: Record<string, string> = { e_mail: 'email', codigo_de_barras: 'boleto', data: 'nascimento', json: 'json', telefone: 'telefone' }

export function optionIcon(label: string) {
  const slug = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return ALIASES[slug] ?? slug
}
