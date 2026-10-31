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
│  ├─ store.ts           bots e conversas em JSON (~/Library/Application Support/gBot/data)
│  ├─ ipc.ts             ponte main ⇄ interface
│  └─ providers/         um provedor por arquivo/pasta + registry.ts
│     └─ claude-code/    sessões `claude -p` em stream-json (uma por conversa)
├─ preload/              expõe `window.gbot` para a interface
├─ shared/types.ts       tipos usados dos dois lados
└─ renderer/src/         interface React
   ├─ avatars/           sprites em pixel art, partes e gerador de avatares
   ├─ components/        PixelAvatar, Sidebar, Composer, ui
   ├─ views/             Início, Chat, Bot, Editor de bot, Login, Avatares, Provedores, Configurações
   └─ state/app.tsx      estado do app (tema, avatar, provedor, conversas)
```

## Como o Claude Code é usado

O gBot abre o executável oficial `claude` (sem modificações) em modo
`-p --input-format stream-json --output-format stream-json`. Cada conversa é uma sessão do Claude Code
(`--session-id` = id da conversa), que fica aberta enquanto é usada e é retomada com `--resume`.
O app nunca lê nem guarda credenciais.

**Perfil separado:** o Claude Code roda com `CLAUDE_CONFIG_DIR=~/Library/Application Support/gBot/claude-profile`
e sem as variáveis `ANTHROPIC_*`/`CLAUDE*` herdadas. Assim o gBot não usa o `~/.claude` do terminal (que pode
apontar para outra conta ou um gateway corporativo). O login é feito em Provedores → "Entrar com conta Claude",
que roda o `claude auth login` oficial (abre o navegador). Equivalente no terminal:

```bash
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/gBot/claude-profile" claude auth login
```

A pasta de trabalho é `~/Library/Application Support/gBot/workspace`.

Ações que pedem permissão são negadas por enquanto (modo `manual`); aprovar pelo app é a Etapa 3.

## Adicionar um provedor

1. Crie `src/main/providers/<nome>.ts` implementando `ChatProvider` (`checkStatus` + `send`).
2. Registre na lista em `src/main/providers/registry.ts`.

A interface lista o provedor automaticamente; `send` emite eventos `mood`, `delta`, `done` ou `error`.

## Etapas

1. ✅ Esqueleto, design MagmaFit, avatares, chat de teste, instalador
2. ✅ Conversa com o Claude Code (streaming, ferramentas, memória, interromper)
3. ✅ Bots (nome, avatar, instruções), 20 avatares + gerador, conversas salvas em disco
4. Bots consultando outros bots (`listar_bots` / `perguntar_ao_bot`) e `@menções`
5. Aprovar permissões no app
6. Ações no computador, ícone na barra de menu
