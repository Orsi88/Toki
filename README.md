# Toki

Gerador local de massas de teste. Os dados, os textos e os arquivos são produzidos no navegador.

```bash
npm install
npm run dev
```

`npm test` cobre CPF, exportação, arquivos e documentos. `npm run build` gera a versão estática.

## Extensão do Toki (Chrome e Edge)

Um menu no navegador, como o do Jam: clique no ícone do Toki (ou `Alt+Shift+T`) em qualquer página.

- **Inserir no campo selecionado:** clique num campo da página, abra o menu e escolha Pessoa, CPF, CNPJ, E-mail, Telefone, CEP, Endereço, Data, Cartão, PIX, UUID ou **Mais** (todos os tipos da Massa Personalizada). O valor entra no campo e vai para a área de transferência. O seletor **Válido / Inválido** vale para tudo.
- **Preencher formulário:** escolha o bloco na página e o Toki preenche tudo com uma pessoa coerente, respeitando opções, limites, confirmação de senha e datas início → fim. Nunca envia o formulário.
- **Capturar para a massa:** leva a estrutura do formulário (sem os valores digitados) para a Massa Personalizada.

Instalar: o ícone de quebra-cabeça no cabeçalho do Toki abre o guia (`#/extensao`), com o download pronto e o passo a passo. Pelo repositório:

1. `npm run build:extension` (o `npm run build` já faz isso) (gera `dist-extension/`, com o motor do Toki em `engine.js`).
2. Em `chrome://extensions` (ou `edge://extensions`), ligue o modo do desenvolvedor e use **Carregar sem compactação** apontando para `dist-extension/`.
3. Fixe o ícone do Toki na barra. Depois de mudar a extensão, rode o build de novo e clique em recarregar (↻) no card dela.
4. Para **Capturar para a massa**, o Toki precisa estar rodando (`npm run dev`); se não estiver em `http://localhost:5173/`, ajuste em ⚙ no menu.

Decisões e limites:

- Canal: a captura vai no fragmento da URL (`#/massa?captura=…`), que não chega a servidor; não há endpoint local nem segredo na extensão. Qualquer link pode montar esse fragmento, por isso o Toki valida origem, versão e tamanho e só aplica depois da confirmação.
- Permissões: só `activeTab`, `scripting` e `storage`; abrir o menu libera a aba atual, sem acesso amplo a sites. A extensão não lê `value`/`checked`, não dispara eventos da página e ignora campos ocultos, técnicos (CSRF, tokens, captcha), desabilitados e somente leitura.
- Restrições aplicadas pelo gerador: opções de `select`/radio/checkbox (tipo Lista de opções), `min`/`max` em Número inteiro e `maxlength` em Texto curto. As demais (`pattern`, `minlength`, limites de outros tipos) aparecem como observação na revisão.
- Vínculos: "confirmar senha/e-mail" vira **Cópia de outra coluna** e a data de fim/volta sai **depois** da data anterior. Os dois podem ser ajustados na revisão da extensão e na Massa Personalizada; o Toki gera na ordem das dependências e recusa ciclos, explicando qual é.
- Campos que só aparecem depois (outra aba, etapa ou seção condicional): use **Capturar mais campos** na revisão; os repetidos não duplicam.
- Lê componentes com shadow DOM aberto. Shadow DOM fechado é inacessível, e iframes são só contados (abra a página do iframe para capturá-lo). Mudar de rota numa SPA durante a seleção encerra a seleção.
- Contrato: `src/domain/capture.ts` (Toki) e `extension/infer.js` (extensão); `tests/capture.test.ts` cobre os dois.
