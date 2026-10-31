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

## Conversas normais e bots

Conversa normal não tem personagem: sem nome, avatar ou persona no prompt. Bots aparecem só em conversas
com um bot ou quando mencionados com `@`. Conversas e bots podem ser excluídos pelo "⋯" (menu lateral, cabeçalho
do chat e página do bot), sempre com confirmação.

## Modelos

Cada provedor declara os modelos que oferece (`ProviderInfo.models`). No Claude Code são os aliases
`default`, `opus`, `sonnet`, `haiku` e `fable` (este exige créditos de uso extras na conta).

- **Bot:** tem um modelo próprio, usado nas conversas com ele e quando outros bots o consultam.
- **Conversa:** tem o próprio modelo (seletor no campo de mensagem); começa com o do bot, se houver.
- Trocar o modelo reabre a sessão com `--model` + `--resume`: a conversa continua de onde parou.
- Cada resposta guarda o modelo usado (`ChatMessage.model`).

## Projetos

Projetos são opcionais: bots e conversas podem ficar soltos ou dentro de um projeto.

- **Pasta de trabalho** (opcional, pode ser escolhida depois): vira o `cwd` do Claude Code nas conversas e bots do
  projeto. Sem pasta, vale a pasta padrão do gBot.
- **Instruções do projeto** (opcionais): entram no prompt de sistema, somadas às instruções de cada bot.
- **Bots visíveis**: dentro de um projeto, os bots dele + os bots soltos; bots de outros projetos ficam de fora.
- Excluir um projeto não apaga nada: os bots e conversas dele voltam a ficar soltos.
- Se a pasta, as instruções ou o projeto da conversa mudam, a sessão do Claude Code é reaberta com `--resume`.

## Bots conversando entre si

O processo principal sobe um servidor MCP em `127.0.0.1` (porta aleatória) com duas ferramentas,
`list_bots` e `ask_bot`. Toda sessão do Claude Code aberta pelo gBot recebe esse servidor via
`--mcp-config`, com um token próprio que identifica quem está chamando (conversa, bot, profundidade).

- `ask_bot` abre (ou reaproveita) a sessão daquele bot **dentro da conversa** (`<conversa>:<bot>`), então
  o bot lembra das consultas e @menções anteriores daquela conversa.
- Proteções: no máximo 3 consultas encadeadas, sem ciclos (A → B → A) e 10 min por consulta.
- `@Nome` no chat envia a mensagem direto ao bot; a resposta aparece com o avatar dele, e o assistente
  da conversa recebe essa troca como contexto na mensagem seguinte.

## Adicionar um provedor

1. Crie `src/main/providers/<nome>.ts` implementando `ChatProvider` (`checkStatus` + `send`).
2. Registre na lista em `src/main/providers/registry.ts`.

A interface lista o provedor automaticamente; `send` emite eventos `mood`, `delta`, `done` ou `error`.

## Etapas

1. ✅ Esqueleto, design MagmaFit, avatares, chat de teste, instalador
2. ✅ Conversa com o Claude Code (streaming, ferramentas, memória, interromper)
3. ✅ Bots (nome, avatar, instruções), 20 avatares + gerador, conversas salvas em disco
4. ✅ Bots consultando outros bots (`list_bots` / `ask_bot` via MCP local) e `@menções`
5. ✅ Projetos: agrupam bots e conversas, com pasta de trabalho e instruções opcionais
6. Aprovar permissões no app
7. Ações no computador, ícone na barra de menu
