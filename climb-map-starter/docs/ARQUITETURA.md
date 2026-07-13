# Arquitetura inicial

## Camadas

1. **Interface**: HTML e CSS sem dependências externas.
2. **Módulos de tela**: arquivos em `assets/js/modules/`.
3. **Serviços**: importação, exportação e futura leitura das planilhas.
4. **Núcleo**: autenticação local, roteamento e armazenamento.
5. **Dados administrativos**: arquivos publicados a partir do Google Sheets.
6. **Dados individuais**: armazenados no navegador e exportáveis em backup substitutivo.

## Regra de manutenção

Nenhuma tela deve ler `localStorage` ou CSV diretamente. Toda leitura passa por serviços ou pelo núcleo, reduzindo acoplamento e facilitando futuras mudanças.
