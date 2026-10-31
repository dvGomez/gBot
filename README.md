# gBot

Chat desktop (Electron + React) que conversa com o Claude Code usando a sua assinatura — e, no futuro, com outros provedores.

## Comandos

```bash
npm run dev        # abre o app em modo desenvolvimento (hot reload)
npm run typecheck  # checa os tipos
npm run dist:mac   # gera o instalador em dist/gBot-<versão>-arm64.dmg
npm run icon       # regenera build/icon.png a partir do avatar em pixel art
```

## Estrutura

```
src/
├─ main/                 processo principal (Node)
│  ├─ index.ts           janela
│  ├─ ipc.ts             ponte main ⇄ interface
│  └─ providers/         um arquivo por provedor + registry.ts
├─ preload/              expõe `window.gbot` para a interface
├─ shared/types.ts       tipos usados dos dois lados
└─ renderer/src/         interface React
   ├─ avatars/           sprites em pixel art e animação
   ├─ components/        PixelAvatar, Sidebar, Composer, ui
   ├─ views/             Início, Chat, Avatares, Provedores, Configurações
   └─ state/app.tsx      estado do app (tema, avatar, provedor, conversas)
```

## Adicionar um provedor

1. Crie `src/main/providers/<nome>.ts` implementando `ChatProvider` (`checkStatus` + `send`).
2. Registre na lista em `src/main/providers/registry.ts`.

A interface lista o provedor automaticamente; `send` emite eventos `mood`, `delta`, `done` ou `error`.

## Etapas

1. ✅ Esqueleto, design MagmaFit, avatares, chat de teste, instalador
2. Conectar o Claude Code via channel (`claude --channels`)
3. Histórico em SQLite, várias sessões, permissões no app
4. Ações no computador, ícone na barra de menu
