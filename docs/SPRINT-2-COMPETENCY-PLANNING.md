# Sprint 2.7 — Planejamento por competência

## Regras implementadas

- Autoavaliação pertence à competência.
- Kanban contém somente competências: Stand by, Em aberto, Em andamento e Concluído.
- Cancelado remove a competência do Kanban e permanece visível no Catálogo.
- Recursos possuem status independente: Em aberto, Em andamento, Concluído e Cancelado.
- Um recurso pode avançar automaticamente a competência, mas nunca a faz retroceder.
- Todos os recursos concluídos fazem a competência ser concluída automaticamente.
- Recursos sem status não aparecem no Kanban.
- Cards concluídos exibem também recursos concluídos ou cancelados.
- Planejamento possui filtros por data, categoria e prioridade.
- Evolução mostra linha anual de realizado e planejado.

## Migração

Registros antigos por nível são consolidados automaticamente na competência correspondente.
