// Captura Inteligente · inferência determinística. Script clássico: roda no content script,
// no service worker (importScripts) e nos testes do Toki (tests/capture.test.ts).
// Não lê valores de campos: só recebe metadados (atributos, labels, opções).
(() => {
  // Tipos reais da Massa Personalizada (src/domain/custom.ts · COLUMN_TYPES). O teste garante que batem.
  const CATALOG = [
    'Nome completo', 'Nome', 'Sobrenome', 'CPF', 'CNPJ', 'E-mail', 'Telefone', 'CEP', 'Endereço',
    'Cidade', 'UF', 'Data de nascimento', 'Idade', 'Data', 'Data e hora', 'Número inteiro', 'Decimal',
    'Valor monetário', 'Porcentagem', 'Cor', 'Comprimento', 'Massa', 'Volume', 'Coordenada', 'Booleano', 'Status',
    'Texto curto', 'Descrição', 'Código (AAA-9999)', 'SKU', 'Cartão', 'Chave PIX', 'Conta bancária', 'UUID', 'Lista de opções',
    'Cópia de outra coluna',
  ]

  const AUTOCOMPLETE = {
    name: 'Nome completo', 'given-name': 'Nome', 'family-name': 'Sobrenome', email: 'E-mail', tel: 'Telefone',
    'tel-national': 'Telefone', 'postal-code': 'CEP', 'street-address': 'Endereço', 'address-line1': 'Endereço',
    'address-level2': 'Cidade', 'address-level1': 'UF', bday: 'Data de nascimento', 'cc-number': 'Cartão',
  }

  // Ordem importa: o mais específico primeiro ("sobrenome" antes de "nome", "nome completo" antes de "nome").
  const KEYWORDS = [
    [/\bcnpj\b/, 'CNPJ'],
    [/\bcpf\b/, 'CPF'],
    [/\b(chave )?pix\b/, 'Chave PIX'],
    [/\bcep\b|\bzip\b|postal/, 'CEP'],
    [/e ?mail/, 'E-mail'],
    [/\b(tel|telefone|celular|fone|phone|whats ?app|mobile)\b/, 'Telefone'],
    [/nascimento|birth|\bbday\b|\bdob\b/, 'Data de nascimento'],
    [/\b(idade|age)\b/, 'Idade'],
    [/sobrenome|last ?name|family ?name|surname/, 'Sobrenome'],
    [/nome completo|full ?name/, 'Nome completo'],
    [/primeiro nome|first ?name|given ?name/, 'Nome'],
    [/razao social|nome fantasia|empresa|company|organiza/, 'Texto curto', 0.5, 'Sem gerador de nome empresarial no Toki; ficou texto curto.'],
    [/\b(nome|name)\b/, 'Nome completo', 0.65],
    [/endereco|logradouro|\brua\b|address|street/, 'Endereço'],
    [/cidade|municipio|\bcity\b/, 'Cidade'],
    [/\buf\b|\bestado\b(?! civil)|\bstate\b/, 'UF'],
    [/cartao|card ?number|\bcard\b/, 'Cartão'],
    [/\bconta\b|account/, 'Conta bancária', 0.6],
    [/senha|password|\bpass\b/, 'Texto curto', 0.6],
    [/preco|valor|price|amount|salario|\btotal\b/, 'Valor monetário', 0.7],
    [/percent|porcentagem/, 'Porcentagem', 0.7],
    [/\bcor\b|colou?r/, 'Cor'],
    [/\buuid\b|\bguid\b/, 'UUID'],
    [/\bsku\b/, 'SKU'],
    [/descri|observa|comentario|mensagem|message|comment|bio\b/, 'Descrição', 0.7],
    [/\bstatus\b|situacao/, 'Status', 0.6],
    [/\bdata\b|\bdate\b/, 'Data', 0.7],
  ]

  const BY_TYPE = {
    email: ['E-mail', 0.9], tel: ['Telefone', 0.85], date: ['Data', 0.75], 'datetime-local': ['Data e hora', 0.8],
    number: ['Número inteiro', 0.6], color: ['Cor', 0.9], checkbox: ['Booleano', 0.75], password: ['Texto curto', 0.5],
  }

  const AGREES = { 'E-mail': 'email', Telefone: 'tel', Data: 'date', 'Data de nascimento': 'date', 'Número inteiro': 'number', Idade: 'number' }

  const IGNORED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file'])
  const TECHNICAL = /csrf|xsrf|authenticity|token|captcha|honeypot|^utm_|^_|viewstate|nonce/i

  function normalize(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[_\-.[\]:]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function ignoreReason(meta) {
    if (IGNORED_TYPES.has(meta.type)) return meta.type === 'hidden' ? 'oculto' : 'botão ou arquivo'
    if (meta.disabled) return 'desabilitado'
    if (meta.readOnly) return 'somente leitura'
    if (meta.hidden) return 'invisível'
    if (TECHNICAL.test(meta.name || '') || TECHNICAL.test(meta.id || '')) return 'técnico'
    return null
  }

  function inferGenerator(meta) {
    if (meta.options && meta.options.length) {
      const multiple = meta.controlType === 'checkbox-group' || meta.multiple
      return { type: 'Lista de opções', confidence: 0.9, source: 'opções do controle', hint: multiple ? 'Múltipla escolha: o Toki gera uma opção por linha.' : '' }
    }
    const auto = AUTOCOMPLETE[String(meta.autocomplete || '').toLowerCase().split(/\s+/).pop()]
    if (auto) return { type: auto, confidence: 0.95, source: 'atributo autocomplete', hint: '' }
    const texts = [meta.label, meta.name, meta.id, meta.placeholder].map(normalize).filter(Boolean)
    for (const [pattern, type, base = 0.8, hint = ''] of KEYWORDS) {
      const hit = texts.findIndex((text) => pattern.test(text))
      if (hit === -1) continue
      let confidence = hit === 0 ? base : base - 0.05
      if (AGREES[type] && AGREES[type] === meta.type) confidence = Math.min(0.97, confidence + 0.15)
      return { type, confidence: Math.round(confidence * 100) / 100, source: hit === 0 ? 'label' : 'nome/id/placeholder', hint }
    }
    if (meta.type === 'number' && (meta.step === 'any' || /[.,]/.test(meta.step || ''))) return { type: 'Decimal', confidence: 0.6, source: 'tipo do input', hint: '' }
    const typed = BY_TYPE[meta.type]
    if (typed) return { type: typed[0], confidence: typed[1], source: 'tipo do input', hint: '' }
    if (meta.controlType === 'textarea') return { type: 'Descrição', confidence: 0.6, source: 'tipo do controle', hint: '' }
    return { type: 'Texto curto', confidence: 0.3, source: 'padrão', hint: 'Não reconhecido; escolha o tipo.' }
  }

  const CONFIRM = /confirm|repet|redigit|novamente|again|verify/
  const END = /\b(fim|final|termino|ate|saida|volta|retorno|end|to|checkout|validade|vencimento)\b/
  const DATE = new Set(['Data', 'Data e hora'])

  // Vínculos que o formulário deixa claros: "confirmar senha/e-mail" copia o campo anterior do mesmo tipo,
  // e a data de fim sai depois da data anterior. Só declara; quem gera coerente é o motor do Toki.
  function linkDependencies(fields) {
    fields.forEach((field, index) => {
      const text = normalize(`${field.label} ${field.name} ${field.id || ''}`)
      const before = fields.slice(0, index).reverse()
      if (CONFIRM.test(text) && field.type !== 'Cópia de outra coluna') {
        const target = before.find((other) => other.type === field.type && other.controlType === field.controlType && !CONFIRM.test(normalize(`${other.label} ${other.name}`)))
        if (target) Object.assign(field, { type: 'Cópia de outra coluna', ref: target.key, confidence: 0.85, source: 'confirmação', hint: '' })
      } else if (DATE.has(field.type) && END.test(text) && !field.after) {
        const target = before.find((other) => DATE.has(other.type))
        if (target) Object.assign(field, { after: target.key })
      }
    })
    return fields
  }

  function buildPayload({ captureId, formName, fields }) {
    const keys = new Set(fields.map((item) => item.key).filter(Boolean))
    return {
      schemaVersion: '1.0',
      source: 'toki-browser-extension',
      captureId,
      form: {
        name: String(formName || '').slice(0, 120),
        fields: fields.map((field, index) => {
          const constraints = {}
          for (const key of ['minLength', 'maxLength', 'min', 'max']) {
            if (typeof field.constraints?.[key] === 'number' && Number.isFinite(field.constraints[key])) constraints[key] = field.constraints[key]
          }
          if (field.constraints?.step) constraints.step = String(field.constraints.step)
          if (field.constraints?.pattern) constraints.pattern = String(field.constraints.pattern).slice(0, 200)
          return {
            id: field.key || `field-${index + 1}`,
            name: field.name,
            label: field.label,
            controlType: field.controlType,
            required: Boolean(field.required),
            constraints,
            ...(field.options && field.options.length ? { options: field.options.slice(0, 200) } : {}),
            generator: {
              type: field.type,
              valid: true,
              ...(field.type === 'Cópia de outra coluna' && keys.has(field.ref) ? { ref: field.ref } : {}),
              ...(DATE.has(field.type) && keys.has(field.after) ? { after: field.after } : {}),
            },
            confidence: field.confidence,
            source: field.source,
            ...(field.hint ? { hint: field.hint } : {}),
          }
        }),
      },
    }
  }

  function encodePayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  globalThis.TokiCapture = { CATALOG, normalize, ignoreReason, inferGenerator, linkDependencies, buildPayload, encodePayload, MAX_PARAM: 120000 }
})()
