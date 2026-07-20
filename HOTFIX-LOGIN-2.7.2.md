# Hotfix de login — 2.7.2

## Erro corrigido

O GitHub Pages/navegador continuava solicitando `views.js?v=2.7.1`, versão que havia sido publicada com erro de sintaxe próximo ao atributo `selected`. Como o módulo falhava antes da inicialização, o formulário de login não recebia o manipulador de `submit`.

## Alterações

- Reescrita explícita das funções de opções de status em `assets/js/modules/views.js`.
- Atualização do cache-busting de `2.7.1` para `2.7.2` em `index.html`, `app.js` e `views.js`.
- Validação de sintaxe de todos os arquivos JavaScript com `node --check`.

## Publicação

Substitua os arquivos do repositório pelo conteúdo deste pacote, faça commit e aguarde o GitHub Pages concluir o deploy. Depois abra a página em uma janela anônima ou use `Ctrl + F5`.
