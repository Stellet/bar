# Regras de Produto

- O projeto é mobile-first.
- A faixa principal de projeto deve considerar celulares entre aproximadamente 360px e 430px de largura.
- Tablet e desktop devem funcionar por responsividade.
- Não criar dashboard desktop nesta fase.
- Desktop deve exibir a mesma aplicação operacional de forma confortável.
- Ações recorrentes devem exigir poucos toques.
- Botões principais precisam ter áreas de toque grandes.
- Evitar formulários extensos.
- O sistema deve aprimorar processos existentes, não obrigar equipes a abandonar práticas físicas úteis.
- Comprovantes físicos continuam fazendo parte do fluxo.
- Contagens parciais são parte central do produto.
- O fluxo principal é:
  Abrir → Lançar → Parcial → Lançar → Parcial → Fechar.
- Uma operação pode possuir várias parciais.
- Movimentações devem ser armazenadas como registros/eventos, não apenas modificando números consolidados.
- Nesta versão, todos os dados são fictícios.
- Nenhum dado real de cliente deve existir no repositório público.
- Não implementar backend nesta fase.
- Não implementar autenticação real nesta fase.
- Não integrar meios de pagamento nesta fase.
- Não implementar previsão, analytics avançado ou dashboard nesta fase.
- O protótipo deve poder ser publicado futuramente no GitHub Pages ou serviço semelhante.

# Regras de UX

- Priorizar velocidade de uso.
- Dar feedback visual imediatamente após ações.
- Reduzir digitação durante a operação.
- Manter sempre visível ou facilmente identificável qual operação está aberta.
- Evitar modais ou etapas desnecessárias.
- Não esconder ações principais dentro de menus.
- Confirmações temporárias devem permitir desfazer ações recentes.
- A contagem final deve inicialmente ser cega sempre que possível.
- O usuário não deve precisar compreender a estrutura técnica para utilizar o sistema.

# Regras Técnicas

- React + TypeScript + Vite.
- Componentes pequenos e reutilizáveis.
- Separar tipos/interfaces de dados da interface.
- Criar camada de persistência separada dos componentes.
- Não acessar localStorage diretamente em vários componentes.
- Centralizar a persistência em um serviço/repository simples.
- Gerar IDs para registros.
- Salvar timestamps reais nas movimentações.
- Estruturar os tipos pensando em futura substituição de localStorage por API.
- Evitar dependências externas quando CSS e React forem suficientes.
- Manter código legível e evitar abstrações prematuras.

# Dados Mockados

- Usuários: Ana, Bruno, Carlos.
- Local: Espaço Demo.
- Evento/operação: Noite Demo.
- Ponto de venda: Bar Principal.
- Produtos: Cerveja Lager, Água, Refrigerante, Energético, Gin, Vodka.
- Utilizar placeholders visuais próprios ou elementos simples.
- Não depender de imagens externas obrigatórias.

# Tipos de Dados

- User
- Venue
- Event
- Operation
- PointOfSale
- Product
- Movement
- PartialCount
- ReceiptBatch
- FinalCount

- Operation deve possuir status: draft, open, closing, closed.
- Movement deve possuir pelo menos: id, operationId, productId, type, quantity, timestamp, userId.
- Tipos iniciais de Movement: courtesy, damage, restock, transfer_in, transfer_out.
- PartialCount representa um checkpoint da operação.
- ReceiptBatch representa um lote físico de notinhas/comprovantes.
- ReceiptBatch deve possuir ao menos: id, operationId, partialId, source, receiptCount, totalValue opcional, notes opcional, timestamp, confirmed.

# Persistência

- Criar camada simples de persistência baseada em localStorage.
- Não espalhar chamadas diretas a localStorage pelos componentes.
- Criar estrutura equivalente a storageService ou operationRepository.
- A camada deve permitir:
  - carregar estado;
  - salvar estado;
  - limpar estado;
  - recuperar operação aberta;
  - salvar movimentações;
  - salvar parciais;
  - salvar lotes;
  - salvar fechamento.
- Atualizar/recarregar a página não deve apagar a operação em andamento.

# Regras de Entrega

- Implementar primeiro uma versão funcional de ponta a ponta.
- Validar fluxo: abrir operação → lançar → parcial → fechar → contagem final → conferir lotes → finalizar.
- Manter foco em UX operacional, mobile-first e demonstrável publicamente.
- Evitar escopo adicional fora do protótipo inicial.
- Atualizar documentação contínua após etapas relevantes.
