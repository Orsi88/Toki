/** Agrupamento das opções, na mesma ordem do protótipo. O último grupo fica oculto até abrir "Opções avançadas". */
export const STEPS: Record<string, [string, string, string[], string[]?][]> = {
  identidade: [
    ['Escolha os campos', 'Marque o que a ficha deve conter.', ['campos']],
    ['Defina a pessoa', 'Campos vazios são sorteados. Brasileira mantém CPF, DDD e CEP coerentes. Estrangeira usa passaporte, telefone e endereço do país de origem.', ['origem', 'genero', 'nome', 'sobrenome', 'idadeMin', 'idadeMax', 'uf', 'cidade', 'pais']],
    ['Formatação e regras de validade', 'Todos os campos saem válidos por padrão. Mude um deles para gerar um caso negativo.', ['mask', 'fmtData', 'emailNome', 'dominio'], ['rCpf', 'rEmail', 'rTel', 'rCep', 'rNasc']],
  ],
  cpf: [
    ['Escolha a regra de geração', 'Defina se o CPF deve passar ou falhar na validação.', ['regra']],
    ['Defina formatação e origem', 'Como o número é exibido e de qual região fiscal ele parece vir.', ['mask', 'uf']],
  ],
  cnpj: [
    ['Escolha a regra de geração', 'Defina se o CNPJ deve passar ou falhar na validação.', ['regra']],
    ['Defina formatação e estabelecimento', 'Máscara de exibição e se o número é de matriz ou filial.', ['mask', 'filial']],
  ],
  nome: [
    ['Escolha a característica', 'O tipo de nome que você quer testar no campo.', ['regra']],
    ['Ajuste a composição', 'Quantas partes o nome terá e o gênero do primeiro nome.', ['partes', 'genero']],
  ],
  email: [
    ['Escolha a regra a testar', 'Gere um e-mail válido ou quebrado de propósito.', ['regra']],
    ['Defina o domínio', 'Prefira um domínio reservado para não atingir caixas reais.', ['dominio']],
  ],
  telefone: [
    ['Escolha tipo e região', 'Celular ou fixo, e o estado que define o DDD.', ['tipo', 'uf']],
    ['Defina formato e regra', 'Como o número aparece e se ele deve ser aceito.', ['formato', 'regra']],
  ],
  cep: [
    ['Escolha o estado', 'O CEP é gerado dentro da faixa numérica do estado.', ['uf']],
    ['Defina formato e regra', 'Com ou sem hífen, válido ou inválido.', ['formato', 'regra']],
  ],
  endereco: [
    ['Escolha a região', 'Estado usado para cidade, bairro e CEP.', ['uf', 'compl']],
  ],
  nascimento: [
    ['Escolha a faixa de idade', 'A idade usa a data de referência desta tela.', ['faixa']],
    ['Defina o formato', 'Formato de exibição da data.', ['formato']],
  ],
  numero: [
    ['Escolha o tipo de valor', 'Inteiro, decimal, porcentagem, monetário, cor, medida ou sequência.', ['tipo', 'sinal', 'repr', 'origemCor', 'corBase', 'alfa', 'regraCor', 'unidade', 'converter']],
    ['Defina o intervalo', 'Usado na geração e na explicação de cada valor.', ['min', 'max', 'ordem', 'passo']],
    ['Selecione a regra que deseja testar', 'Valores dentro do intervalo, fora dele ou repetidos. Todas as variações junta cada regra.', ['regra', 'unicos']],
    ['Formatação', 'Casas decimais e separadores.', ['casas', 'sep', 'milhar']],
  ],
  data: [
    ['Escolha o tipo', 'Data, horário, data e hora, timestamp Unix ou ISO 8601. Todas as variações gera a massa inteira.', ['tipo']],
    ['Selecione a regra que deseja testar', 'Datas válidas, passadas, futuras, inexistentes, bissextas ou fora do intervalo. Todas as variações junta cada regra.', ['regra']],
    ['Defina formato e intervalo', '', ['formato', 'anoMin', 'anoMax', 'fuso']],
  ],
  bancario: [
    ['Escolha banco e tipo de conta', 'O código do banco aparece no registro gerado.', ['banco', 'tipo']],
    ['Escolha a regra a testar', 'Conta com dígito verificador correto ou quebrado.', ['regra']],
  ],
  cartao: [
    ['Escolha a bandeira', 'A bandeira define prefixo, comprimento do número e tamanho do CVV. O produto diz se o cartão é de crédito, débito ou os dois.', ['bandeira', 'produto', 'origem']],
    ['Configure as regras de validade', 'Defina se o número e a validade devem ser aceitos ou recusados.', ['regra', 'validade'], ['mask']],
  ],
  pix: [
    ['Escolha o tipo de chave', 'Cada tipo segue o formato aceito pelo DICT.', ['tipo']],
    ['Configure as regras', 'Formato da chave e, se quiser, o payload copia e cola.', ['regra', 'payload', 'valor', 'crc']],
  ],
  boleto: [
    ['Escolha o banco', 'O código entra na linha digitável e no código de barras. O vencimento define o fator Febraban.', ['banco', 'vencimento']],
    ['Configure a regra', 'DV correto, DV quebrado ou comprimento inválido. Todas as variações junta cada caso.', ['regra'], ['mask']],
  ],
  borda: [
    ['Configure o caso de borda', 'Escolha um tipo ou Todas as variações para montar uma massa com cada caso. O limite vale para comprimento e valor.', ['regra', 'limite']],
  ],
  texto: [
    ['Escolha o tipo de texto', 'A história do bichinho é a base. A prévia muda junto com as opções.', ['modo', 'padrao']],
    ['Defina o tamanho', 'Escolha uma versão pronta da história ou um tamanho exato.', ['medida', 'versao', 'tamanho']],
    ['Caracterize o texto', 'Letras, acentos, emojis, símbolos e quebras de linha.', ['caixa', 'maiusc', 'minusc', 'numeros', 'acentos', 'emojis', 'especiais', 'capitulos', 'quebras', 'espacos', 'unicode', 'custom'], ['limite']],
  ],
  mapa: [
    ['Escolha o que gerar', 'Um ponto ou uma área, no formato que o sistema lê.', ['tipo', 'formato', 'regiao']],
    ['Defina a precisão e, se quiser, o retângulo', 'A área informada só aparece quando a região é Informada.', ['latMin', 'latMax', 'lngMin', 'lngMax', 'casas']],
    ['Selecione a regra que deseja testar', 'Válida, ou um caso negativo explícito. Todas as variações junta cada regra.', ['regra']],
  ],
  estrutura: [
    ['Escolha o tipo de dado estruturado', 'JSON, XML, CSV, YAML, SQL, código, lista, hierarquia ou série.', ['formato', 'simbologia', 'conteudoModo', 'conteudo', 'ecc', 'margem', 'lado', 'qtdCodigos', 'regraCodigo', 'regraQr']],
    ['Defina as propriedades', 'Campos do registro, itens da lista, árvore ou pontos da série.', ['campos', 'itens', 'rotulo', 'regraLista', 'niveis', 'filhos', 'saida', 'regraHier', 'pontos', 'seriesQtd', 'padrao', 'catTipo', 'intervaloMin', 'intervaloMax', 'casasSerie', 'saidaSerie']],
    ['Escolha a regra a testar', 'Conteúdo válido ou quebrado de propósito.', ['regra'], ['indent', 'raiz']],
  ],
}
