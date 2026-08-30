# Development Log

## Estado atual

- Projeto configurado para publicação estática em `https://stellet.github.io/bar/` por GitHub Pages.
- Projeto base em React + TypeScript + Vite configurado e operacional.
- Fluxo principal do protótipo implementado: login fake, abertura de operação, lançamentos rápidos, parciais, fechamento de operação, conferência de lotes e resumo final.
- Persistência em localStorage centralizada em um serviço dedicado.
- Aplicação mobile-first com foco em operação rápida e alta legibilidade em telas pequenas.
- Build validado com `npm run build` e servidor de desenvolvimento iniciado com `npm run dev -- --host 0.0.0.0`.

## Últimas alterações

- Configuração de `base: '/bar/'` no Vite, derivada do remote `https://github.com/Stellet/bar.git`.
- Criação do workflow `.github/workflows/deploy.yml` para build e publicação automática de `dist/` no GitHub Pages em pushes para `master` ou execução manual.
- Ajuste do favicon para usar `%BASE_URL%`, evitando caminho absoluto incompatível com a subpasta do GitHub Pages.
- Correção conceitual da parcial: ela passou a ser tratada como checkpoint físico neutro, mostrando Estoque anterior, Contagem atual e Saída no período, sem esperado, diferença, falta, sobra ou indicação de acerto.
- O fluxo da parcial foi ajustado para `Contagem → Notinhas → Financeiro/Resumo`.
- Lotes agora representam somente grupos físicos sequenciais de notinhas, com origem operacional opcional, número de comprovantes, valor opcional, observação e horário automático.
- “Dinheiro” foi removido das origens de lote; valores registrados nas máquinas e dinheiro físico contado ganharam campos opcionais separados.
- O fechamento preserva separadamente saída física, notinhas, valores de máquinas, dinheiro físico, cortesias e perdas, sem implementar conciliação financeira avançada.
- A troca direta de operador foi substituída por bottom sheet com seleção e confirmação explícita; a estrutura continua preparada para futura autenticação, sem implementar PIN/código.
- Os contadores de lançamentos e parciais da tela principal passaram a abrir bottom sheets com seus respectivos detalhes.
- O fechamento adotou o fluxo visual `Contagem → Conferência → Comprovantes`, mantendo a contagem inicial cega.
- A conferência final de estoque exibe Esperado, Contado, Diferença e os estados textuais OK, Falta ou Sobra por produto.
- Produtos mockados receberam `basePrice` em BRL para cálculo demonstrativo.
- O resumo final foi reorganizado para priorizar estoque final, estoque inicial, saída física, venda presumida e valor estimado, seguido dos indicadores operacionais e de conferência.
- Foram adicionados cabeçalhos compactos, CTAs inferiores persistentes e overlays com fundo escurecido e fechamento explícito.
- Produtos ativos passaram a ser definidos pelo estoque inicial maior que zero e filtram lançamentos, transferências, parciais e fechamento.
- A operação agora distingue `openedByUserId` de `currentOperatorUserId`; movimentos e parciais preservam o operador responsável no momento do registro.
- Foi adicionada uma seleção rápida de operador após a abertura e troca persistente de operador durante a operação.
- Transferência saiu do seletor de lançamentos rápidos e ganhou fluxo próprio para recebimento (`transfer_in`) e envio (`transfer_out`).
- A tela principal ganhou um resumo horizontal compacto da carga inicial dos produtos ativos.
- Foram adicionadas ações Voltar nas telas com retorno lógico, preservando rascunhos ou confirmando descarte quando necessário.
- A abertura prioriza digitação numérica direta, com seleção automática do valor ao focar o campo.
- Correção da duração no resumo final, calculada de `openedAt` até o instante atual no resumo e de `closedAt` após a finalização real.
- Modelagem explícita de lotes por período: `partial` para lotes vinculados a uma parcial e `final` para lotes posteriores à última parcial, com compatibilidade para dados locais anteriores.
- Inclusão da seção “Período final” na conferência, com listagem, confirmação, persistência e contabilização dos respectivos lotes.
- Bloqueio da finalização enquanto houver lotes pendentes, acompanhado de mensagem textual e retorno para a conferência.
- Persistência da etapa de fechamento e do rascunho da contagem final para retomada após recarregar a página.
- Correção dos metadados básicos do HTML e do requisito mínimo de Node.js no README.
- Inicialização do projeto Vite e configuração do ambiente React/TypeScript.
- Criação dos dados mockados do bar, usuários, produtos e contexto operacional.
- Implementação da camada `storageService` para persistência do estado local.
- Estruturação dos tipos centrais do domínio em `src/types.ts`.
- Desenvolvimento da interface principal em `src/App.tsx` cobrindo: login, abertura, lançamentos, contagem parcial, lotes de comprovantes, fechamento, conferência e resumo.
- Estilização inicial mobile-first em `src/styles.css`.
- Atualização da documentação de projeto com regras, README e handoff de desenvolvimento.

## Decisões técnicas

- O deploy usa apenas actions oficiais: `actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact` e `actions/deploy-pages`.
- O workflow usa Node.js 22, `npm ci` e `npm run build`, publicando exclusivamente o diretório `dist/`.
- A saída do período de uma parcial usa o último estoque contado (ou o inicial), somado a reposições e entradas, descontadas transferências de saída e a contagem atual; o resultado é neutro e limitado ao mínimo zero.
- Valores financeiros opcionais são armazenados separadamente em `FinancialSnapshot`; eles não alteram lotes nem representam conciliação com meios de pagamento.
- `ReceiptBatch.sequenceNumber` identifica cada lote fisicamente, com migração automática para dados anteriores.
- Saída física é calculada por produto como `inicial + reposições + transfer_in - transfer_out - final`; venda presumida desconta cortesias e perdas, sempre limitada ao mínimo zero.
- O valor estimado usa `venda presumida × basePrice` e é identificado como estimativa sem integração com vendas ou maquininhas.
- Overlays de operador, lançamentos e parciais compartilham o mesmo padrão de bottom sheet sem nova dependência.
- `activeProductIds` fica registrado na operação para permitir evolução futura sem alterar os produtos globais mockados.
- Estados antigos são migrados na leitura: produtos ativos são inferidos do estoque inicial e o antigo `userId` alimenta abertura, operador atual e parciais sem autoria.
- A troca de operador altera apenas registros futuros; eventos já gravados mantêm seu `userId` original.
- Foi adotada arquitetura simples para protótipo, sem backend, sem autenticação real e sem dependências pesadas.
- Persistência local centralizada para evitar acesso direto a `localStorage` em vários componentes.
- Os tipos e dados foram separados da interface, com foco em evolução futura para API sem quebrar a estrutura atual.
- O fluxo foi desenhado como operação de campo: poucas telas, visão imediata do status e ações primárias sempre acessíveis.
- A regra de “comprovantes físicos continuam relevantes” foi incorporada ao modelo de lotes e parciais digitais.

## Problemas conhecidos

- O protótipo é demonstrativo e não substitui processos reais de PDV, maquininhas ou auditoria comercial.
- A lógica de fechamento e conferência continua sendo uma simulação operacional, sem regras fiscais ou tolerâncias avançadas.
- A camada de UI é adequada para valiação de UX e prototipagem, mas ainda não foi refinada para produção ou integração real.
- A validação manual integral em navegador/dispositivo físico continua pendente; a tentativa de automação headless não avançou porque a porta de depuração do Chrome local foi recusada.

## Validação desta etapa

- GitHub Pages: `npm run build` concluído com sucesso após configurar o base `/bar/`.
- O `dist/index.html` gerado foi inspecionado e referencia favicon, JavaScript e CSS sob `/bar/`.
- O preview de produção foi servido em `/bar/`; página, JavaScript, CSS e favicon responderam HTTP 200.
- O remote configurado aponta para `Stellet/bar` e o workflow observa a branch atual `master`.
- Correção conceitual de parcial/notinhas: `npm run build` concluído com sucesso, sem erros TypeScript.
- Auditoria textual confirmou ausência de Esperado, Diferença, Falta, Sobra e OK no fluxo da parcial; esses termos permanecem somente no fechamento final.
- Verificado que “Dinheiro” não integra mais as origens de lotes e que todos os campos de contagem usam “Nº de comprovantes”.
- Verificados separação e persistência estrutural de valores de máquinas, dinheiro físico e lotes sequenciais.
- A responsividade recebeu regras específicas para 390 px, mas a validação visual interativa continua pendente devido à indisponibilidade do navegador headless já registrada.
- Rodada de UX operacional: `npm run build` concluído com sucesso, sem erros TypeScript.
- Fórmula validada com cenário controlado: inicial 100, reposição 10, entrada 5, saída 3, final 70, cortesia 4 e perda 2 resultaram em saída física 42, venda presumida 36 e valor estimado R$ 360,00 para preço base 10.
- Verificações de código confirmaram troca de operador com confirmação, overlays dos dois contadores, limites mínimos zero e identificação de “Valor estimado”.
- A tentativa de renderização automatizada em viewport 390 × 844 pelo Chrome headless ficou sem resposta e foi interrompida; validação visual e fluxo integral de cliques não foram registrados como concluídos.
- Nova rodada: `npm run build` concluído com sucesso, sem erros TypeScript, usando Vite 8.2.2.
- Migração simulada de estado legado validou produtos ativos (`beer`, `water`, `gin`), responsável pela abertura, operador atual e autoria de parcial.
- Verificações de escopo confirmaram somente Cortesia, Dano/perda e Reposição no lançamento rápido e as opções Receber/Enviar produtos na transferência.
- Servidor de desenvolvimento respondeu HTTP 200 após as alterações.
- O roteiro visual completo em 360–430 px e os cliques manuais continuam pendentes de navegador interativo; não foram registrados como concluídos nesta rodada.
- `npm run build`: concluído com sucesso usando TypeScript e Vite 8.2.2.
- Servidor de desenvolvimento: resposta HTTP 200, com título “Controle de Bar” e idioma `pt-BR`.
- Foram inspecionados os estados persistidos das quatro etapas de fechamento, o rascunho da contagem final, a migração de lotes anteriores, o agrupamento de lotes finais e a condição que impede finalizar com pendências.
- O roteiro integral de cliques e reloads não foi registrado como concluído, pois o Chrome headless local não disponibilizou a conexão de depuração necessária.

## Próximos passos

- Refinar a experiência de fluxo de fechamento para reduzir passos e aumentar clareza visual.
- Ajustar microinterações e feedback visual para ações de desfazer e confirmação.
- Validar o protótipo em dispositivos físicos e em diferentes larguras de tela.
- Expandir elementos de histórico e contagem quando houver necessidade de etapa específica de UX.
- Considerar exportação de dados ou sincronização futura, sem sair do escopo de protótipo.
