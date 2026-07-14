# Sprint 2.1 — Trilha acompanhada

Esta entrega conecta as trilhas oficiais ao uso individual do Climb Map.

## Funcionalidades

- selecionar uma trilha oficial para acompanhar;
- visualizar o progresso atual em cada trilha;
- ver competências e níveis de referência;
- identificar lacunas da trilha;
- adicionar uma lacuna individual ao planejamento;
- adicionar todas as lacunas ao planejamento;
- exibir a trilha acompanhada no Meu Mapa;
- preservar a escolha no backup local do usuário.

## Regra provisória de lacuna

Nesta versão, uma competência da trilha é considerada lacuna enquanto seu progresso for inferior a 100%.

A comparação matemática com o nível mínimo será refinada quando a fórmula oficial de aderência por nível estiver aprovada. O nível mínimo já é exibido para consulta e continua preservado nos dados.

## Arquivos alterados

- `assets/js/services/user-data-service.js`
- `assets/js/business/business-engine.js`
- `assets/js/modules/views.js`
- `assets/css/components.css`
- `assets/js/app.js`
- `index.html`
