// Dados pessoais › Pessoa jurídica: ficha completa de empresa fictícia. Os ajudantes (CNPJ, pessoa coerente
// com UF/cidade/CEP, data de referência) vêm do motor, para não haver um segundo gerador de CNPJ ou endereço.
type Random = () => number
type Person = { nome: string; uf: string; cidade: string; bairro: string; rua: string; numero: number; cep: string; tel: string }
type Item = { tag: string; tone: string; rule: string; checks: [string, string][]; fields: { k: string; key: string; v: string }[]; meta?: Record<string, unknown> }

export type CompanyHelpers = {
  cnpjS: (r: Random, alfa: boolean, filial: boolean) => string
  fmtCnpj: (value: string, mask: boolean) => string
  person: (r: Random, options: { uf?: string }) => Person
  reference: () => Date
  ufs: string[]
}

const PREFIX = ['Horizonte', 'Aurora', 'Vale Verde', 'Nova Era', 'Atlântica', 'Pioneira', 'Ipê', 'Sol Nascente', 'Cerrado', 'Mar Azul', 'Serra Alta', 'Brisa', 'Raiz', 'Farol', 'Jequitibá']
const ACTIVITY: [string, string][] = [
  ['Soluções em Tecnologia', 'Tech'],
  ['Comércio de Alimentos', 'Alimentos'],
  ['Serviços Médicos', 'Saúde'],
  ['Transportes e Logística', 'Log'],
  ['Construções e Reformas', 'Obras'],
  ['Consultoria Empresarial', 'Consultoria'],
  ['Indústria Têxtil', 'Têxtil'],
  ['Educação e Cursos', 'Educação'],
  ['Comércio de Móveis', 'Móveis'],
  ['Serviços Contábeis', 'Contábil'],
]
export const NATUREZAS = ['Sociedade Limitada (Ltda)', 'Sociedade Anônima (S.A.)', 'Sociedade Limitada Unipessoal (SLU)', 'Microempreendedor Individual (MEI)']

const int = (r: Random, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: Random, list: readonly T[]) => list[Math.floor(r() * list.length)]
const pad = (n: number) => String(n).padStart(2, '0')
const slug = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export function companyEngine(h: CompanyHelpers) {
  const def = { natureza: 'Qualquer', uf: 'Qualquer', regra: 'CNPJ válido', mask: 'Com máscara', filial: 'Matriz', qtd: 1 }
  const fields = [
    { k: 'natureza', label: 'Natureza jurídica', type: 'sel', opts: ['Qualquer', ...NATUREZAS] },
    { k: 'uf', label: 'Estado', type: 'sel', opts: ['Qualquer', ...h.ufs] },
    { k: 'regra', label: 'CNPJ', type: 'seg', opts: ['CNPJ válido', 'CNPJ inválido'], help: 'Inválido troca o último dígito verificador; o resto da ficha continua coerente.' },
    { k: 'mask', label: 'Formatação', type: 'seg', opts: ['Com máscara', 'Sem máscara'] },
    { k: 'filial', label: 'Estabelecimento', type: 'seg', opts: ['Matriz', 'Filial'] },
    { k: 'qtd', label: 'Quantidade de empresas', type: 'num', presets: [1, 5, 10, 100] },
  ]

  function one(v: Record<string, unknown>, r: Random): Item {
    const natureza = v.natureza === 'Qualquer' || !NATUREZAS.includes(String(v.natureza)) ? pick(r, NATUREZAS) : String(v.natureza)
    const who = h.person(r, v.uf && v.uf !== 'Qualquer' ? { uf: String(v.uf) } : {})
    const [activity, short] = pick(r, ACTIVITY)
    const brand = pick(r, PREFIX)
    const mei = natureza.includes('MEI')
    const fantasia = `${brand} ${short}`
    const razao = mei ? who.nome : `${brand} ${activity} ${natureza.includes('S.A.') ? 'S.A.' : 'Ltda'}`
    let cnpj = h.cnpjS(r, false, v.filial === 'Filial')
    const bad = v.regra === 'CNPJ inválido'
    if (bad) cnpj = cnpj.slice(0, 13) + ((Number(cnpj[13]) + 1) % 10)
    const today = h.reference()
    const opened = new Date(today.getFullYear() - int(r, 1, 30), int(r, 0, 11), int(r, 1, 28))
    const age = today.getFullYear() - opened.getFullYear() - (today < new Date(today.getFullYear(), opened.getMonth(), opened.getDate()) ? 1 : 0)
    // Sociedade por ações não pode ser ME nem EPP (LC 123/2006, art. 3º, § 4º, X): sai sempre como "Demais".
    const porte = mei ? 'MEI' : natureza.includes('S.A.') ? 'Demais' : pick(r, ['ME', 'EPP', 'Demais'])
    // Empresa usa telefone fixo (8 dígitos começando em 3) com o DDD do mesmo estado do endereço.
    const cell = /^\((\d{2})\) 9(\d{4})-(\d{4})$/.exec(who.tel)
    const phone = cell ? `(${cell[1]}) 3${cell[2].slice(1)}-${cell[3]}` : who.tel
    const domain = `${slug(fantasia)}.com.br`
    const responsible = h.person(r, { uf: who.uf }).nome
    return {
      tag: bad ? 'CNPJ com DV inválido' : 'todos os campos válidos',
      tone: bad ? 'bad' : 'ok',
      rule: bad ? 'cnpj_invalido' : 'valida',
      checks: [[bad ? 'CNPJ com DV inválido' : 'todos os campos válidos', bad ? 'bad' : 'ok']],
      meta: { fantasia, razao, cidade: who.cidade, uf: who.uf, age },
      fields: [
        ['Razão social', 'razao_social', razao],
        ['Nome fantasia', 'nome_fantasia', fantasia],
        ['CNPJ', 'cnpj', h.fmtCnpj(cnpj, v.mask !== 'Sem máscara')],
        ['Natureza jurídica', 'natureza', natureza],
        ['Porte', 'porte', porte],
        ['Data de abertura', 'abertura', `${pad(opened.getDate())}/${pad(opened.getMonth() + 1)}/${opened.getFullYear()}`],
        ['E-mail', 'email', `contato@${domain}`],
        ['Telefone', 'telefone', phone],
        ['CEP', 'cep', who.cep],
        ['Endereço', 'endereco', `${who.rua}, ${who.numero} – ${who.bairro}`],
        ['Cidade', 'cidade', who.cidade],
        ['UF', 'uf', who.uf],
        ['Responsável', 'responsavel', responsible],
      ].map(([k, key, value]) => ({ k, key, v: String(value) })),
    }
  }

  return {
    kind: 'value',
    pl: ['empresa', 'empresas'],
    def,
    fields,
    run: (v: Record<string, unknown>, r: Random) => Array.from({ length: Math.max(1, Math.min(Number(v.qtd) || 1, 1000)) }, () => one(v, r)),
  }
}
