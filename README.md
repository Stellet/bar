# Bar Operations Prototype

Protótipo web mobile-first para simular operação operacional de bar e eventos, com foco em lançamentos rápidos, contagens parciais, conferência de notinhas e fechamento de operação.

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev -- --host 0.0.0.0
```

## Build

```bash
npm run build
```

## Descrição do protótipo

A aplicação simula uma operação operacional complementar para bares e eventos. O objetivo é apoiar o processo existente de comprovantes físicos, mantendo a equipe em um fluxo ágil com:

- login fake
- abertura de operação
- lançamento rápido de cortesias, danos, reposições e transferências
- criação de parciais digitais
- cadastro de lotes de comprovantes
- fechamento e contagem final
- conferência de divergências por produto
- resumo final da operação

## Persistência

Todos os dados ficam armazenados no navegador via `localStorage`, permitindo continuar uma operação mesmo após recarregar a página.

## Observações

- Sem backend.
- Sem banco de dados.
- Sem autenticação real.
- Sem PWA/service worker nesta etapa.
- Foco em validação de UX e fluxo operacional em ambiente mobile-first.

## Status atual

- Versão funcional de protótipo com fluxo operacional central implementado.
- Build validado com TypeScript e Vite.
- Servidor de desenvolvimento disponível em `http://localhost:5173/`.
