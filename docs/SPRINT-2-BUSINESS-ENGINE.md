# Sprint 2 — Business Engine e primeiros dados pessoais

## Objetivo

Criar a camada de regras de negócio e permitir o primeiro fluxo real de uso do Climb Map.

## Arquivos novos

- `assets/js/business/business-engine.js`
- `assets/js/services/user-data-service.js`

## Funcionalidades incluídas

- autoavaliação por competência;
- favoritos;
- inclusão no planejamento;
- status individual dos recursos;
- cálculo inicial da nota de competência;
- cálculo agregado por categoria e geral;
- painel com indicadores reais;
- planejamento em quatro colunas.

## Fórmula provisória de teste

A nota atual é calculada por:

`(valor da autoavaliação + pontos dos recursos concluídos) / (máximo da autoavaliação + pontos de todos os recursos disponíveis)`

A fórmula está isolada no Business Engine e poderá ser alterada sem modificar as telas.

## Armazenamento

Todos os dados individuais permanecem no navegador e fazem parte do backup técnico existente.
