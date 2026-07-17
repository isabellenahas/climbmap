# Migração técnica V1 → V2

## Diagnóstico do repositório real

- Aplicação estática em HTML, CSS e JavaScript ES Modules.
- Não há React, Node no runtime ou backend.
- Dados administrativos são carregados por `data/manifest.json`.
- O parser próprio detecta automaticamente vírgula, ponto e vírgula ou tabulação.
- O parser já remove UTF-8 BOM.
- Dados do usuário ficam em `localStorage`, chave `climbMapStateV1`.
- A V1 relacionava recurso diretamente ao nível.
- A V1 concluía automaticamente a competência quando todos os recursos eram concluídos.

## Alterações implementadas

1. Manifesto atualizado para schema 2.0.0.
2. Nomes formais dos CSVs V2 criados.
3. Alias de colunas permite receber `ID` ou nomes técnicos atuais.
4. Recurso e nível passam a usar `05_Nivel_Recursos.csv`.
5. Pré-requisitos ganharam estrutura polimórfica e informativa.
6. Status do Kanban agora representam ciclo: Backlog, A iniciar, Em andamento e Pausada.
7. Ciclo encerrado e Cancelada ficam fora do Kanban.
8. Todos os recursos concluídos geram confirmação; não encerram silenciosamente.
9. Autoavaliação não é alterada por recursos.
10. Dados locais antigos são migrados para os novos valores técnicos.

## Limite consciente da V2 inicial

A interface mantém um ciclo ativo por competência. Ao reabrir uma competência encerrada ou cancelada, o ciclo anterior é arquivado em `cycleHistory` e um novo ciclo é criado. Isso preserva simplicidade e histórico sem exigir um gerenciador completo de ciclos simultâneos.

## Como validar

Sirva a pasta por HTTP; não abra `index.html` diretamente:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

Validação estrutural:

```bash
node scripts/validate-data.mjs
```
