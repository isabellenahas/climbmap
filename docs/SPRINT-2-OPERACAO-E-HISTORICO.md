# Sprint 2.6 — Meu Mapa operacional e histórico de evolução

## Entregas

- Meu Mapa reorganizado como página operacional.
- Competências e recursos em desenvolvimento exibidos separadamente.
- Heatmap operacional por categoria.
- Próximos passos baseados no planejamento atual.
- Evolução preparada para registrar marcos a partir desta versão.
- Histórico incluído no backup local do usuário.
- Modal de competência com contraste entre competência, níveis e recursos.
- Recursos identificados em verde no Planejamento; níveis de competência permanecem azuis.
- Trilhas do tipo `pessoa` filtradas pela coluna opcional `usuario_destino`.

## Coluna opcional em `trilhas.csv`

Adicionar ao Google Sheets e ao CSV publicado:

```text
usuario_destino
```

Regras:

- `tipo = carreira`: trilha visível para todos.
- `tipo = pessoa` e `usuario_destino` preenchido: visível somente para o perfil local com o mesmo nome.
- `tipo = pessoa` e `usuario_destino` vazio: trilha pessoal genérica, visível para todos.

A comparação ignora diferenças entre letras maiúsculas e minúsculas.

## Histórico

O histórico começa a partir desta versão. A aplicação não inventa eventos antigos. São registrados:

- alteração da autoavaliação;
- nível planejado, iniciado ou concluído;
- recurso planejado, iniciado ou concluído;
- evidência adicionada.
