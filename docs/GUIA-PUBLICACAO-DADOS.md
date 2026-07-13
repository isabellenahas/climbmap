# Guia de publicação dos dados

1. Edite a base oficial no Google Sheets.
2. Exporte cada aba usada pela aplicação como CSV.
3. Não altere o nome técnico das colunas.
4. Substitua o arquivo correspondente dentro de `data/`.
5. Faça um commit no branch `main`.
6. Aguarde a publicação do GitHub Pages.
7. Abra **Administração** no Climb Map e confira se todos os datasets estão com estado `ready`.

## Regras

- Cada CSV possui uma linha de cabeçalho obrigatória.
- IDs nunca devem ser reutilizados.
- Nomes podem mudar; IDs não.
- Valores booleanos podem ser `TRUE/FALSE` ou `Sim/Não`.
- A importação de um CSV substitui integralmente o arquivo anterior.
