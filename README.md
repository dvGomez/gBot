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

## Memória (bots e fluxos aprendem)

Cada bot e cada fluxo tem uma memória de **lições** (`data/memory/<bot|flow>-<id>.json`): título, quando usar,
passos curtos e por quê.

- O próprio Claude registra com a ferramenta `save_lesson` (só existe em sessões de bot ou de fluxo; conversa normal
  não tem memória). Mesmo título atualiza a lição em vez de duplicar.
- **Reflexão automática:** se num turno alguma ferramenta falhou ou foi negada, o gBot manda (sem aparecer no chat)
  um pedido curto para registrar a lição, se houver. Os turnos da sessão ficam em fila, então a próxima mensagem espera.
- As lições ativas entram no prompt de sistema num bloco compacto (`título | quando | passos`, sem o "por quê"),
  no máximo 30. A tela mostra ~quantos tokens isso ocupa.
- Onde ver/editar: página do bot (card **Memória**) e aba **Memória** do fluxo. Dá para adicionar à mão, editar,
  desligar (não vai para o prompt) e excluir. Caixinhas de prompt usam a memória do fluxo; caixinhas de bot, a do bot.

## Fluxos (canvas de automações)

Um fluxo é um canvas (React Flow) com um **gatilho** e caixinhas ligadas por setas:

- **Gatilho:** em horários (dias da semana + um ou mais horários) ou "repetir a cada N minutos/horas". Só fluxos
  **ativos** disparam; "Rodar agora" funciona sempre.
- **Bot:** manda uma mensagem a um bot (usa o modelo e as instruções dele).
- **Prompt:** prompt solto, com IA (provedor) e modelo escolhidos na caixinha.
- O resultado das caixinhas anteriores vai junto automaticamente; `{{anterior}}` escolhe onde ele entra.
- Pode ramificar: ramos rodam em paralelo e uma caixinha espera todas as que chegam nela. Ciclos são recusados.
- Histórico das últimas 50 execuções por fluxo, com o resultado de cada caixinha (`data/flow-runs/<fluxo>.json`).
- O agendador roda no processo principal a cada 20 s. Fechar a janela não encerra o app: ele fica no **ícone da
  barra de menu** (Abrir gBot / fluxos ativos / Sair). Horários em que o app estava fechado não são executados depois.

## Navegador do gBot

O gBot abre o Edge/Chrome/Brave **instalado** (escolha em Configurações; padrão: Edge) com um perfil fixo em
`~/Library/Application Support/gBot/browser-profiles/<navegador>` e se conecta via CDP (`playwright-core`).

- O perfil é um só por navegador, compartilhado por todas as conversas e bots: logins e cookies ficam salvos
  entre conversas, bots e reinícios (o perfil já nasce com "continuar de onde parou" para manter cookies de sessão).
- Abre com `--disable-blink-features=AutomationControlled`, então os sites não veem `navigator.webdriver`.
- Ferramentas no MCP do gBot: `browser_navigate`, `browser_read`, `browser_click`, `browser_type`,
  `browser_press`, `browser_screenshot`, `browser_tabs`, `browser_back`.
- Por padrão o navegador acessa os sites direto. Em Configurações dá para ligar **Pedir aprovação antes de usar
  sites**: aí cada site novo mostra no chat **Permitir nesta conversa**, **Sempre em <site>** (vai para a lista de
  sites sempre permitidos) ou **Negar**; sem resposta em 5 min, é negado.
- O Claude não digita senhas nem códigos: login, MFA e CAPTCHA são feitos pelo usuário na janela.

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
6. ✅ Fluxos: canvas com gatilho por horário/intervalo, caixinhas de bot e prompt, histórico e barra de menu
7. Aprovar permissões no app
8. Ações no computador
