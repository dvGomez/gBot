import { z } from 'zod'
import type { AutomationPlan, Flow, FlowSchedule } from '@shared/types'
import { listFlows } from '../../flows/store'
import { listBots, listProjects } from '../../store'

/**
 * Arquiteto do gBot: monta com o usuário o que criar ou mudar (bots, fluxos, projeto) e propõe com `propose_plan`, que
 * aparece no chat num cartão. Na página inicial é uma conversa própria, que testa de verdade antes de propor; nas
 * outras conversas, o assistente consulta o que existe com `gbot_overview` e propõe do mesmo jeito. Só propõe: quem
 * cria ou altera é a interface, depois que o usuário aceita.
 */

const MODELS = ['default', 'haiku', 'sonnet', 'opus'] as const

const scheduleSchema = z.union([
  z.object({ mode: z.literal('times'), days: z.array(z.number().int().min(0).max(6)), times: z.array(z.string().regex(/^\d{2}:\d{2}$/)) }),
  z.object({ mode: z.literal('interval'), everyMinutes: z.number().int().min(5) })
])

const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bot'), label: z.string().nullish(), bot: z.string(), message: z.string().default('') }),
  z.object({ type: z.literal('prompt'), label: z.string().nullish(), message: z.string().default('') }),
  z.object({ type: z.literal('decision'), label: z.string().nullish(), message: z.string().default(''), options: z.array(z.string()).min(2) }),
  z.object({ type: z.literal('confirm'), label: z.string().nullish(), message: z.string().default(''), options: z.array(z.string()).min(1).max(5) })
])

export const planSchema = z.object({
  title: z.string(),
  summary: z.string().default(''),
  project: z
    .union([
      z.object({
        existingId: z.string(),
        edit: z.boolean().nullish(),
        name: z.string().nullish(),
        description: z.string().nullish(),
        instructions: z.string().nullish()
      }),
      z.object({ name: z.string(), description: z.string().default(''), instructions: z.string().default('') })
    ])
    .nullish(),
  bots: z
    .array(
      z.object({
        ref: z.string(),
        existingId: z.string().nullish(),
        edit: z.boolean().nullish(),
        name: z.string(),
        description: z.string().default(''),
        instructions: z.string().default(''),
        model: z.string().nullish(),
        why: z.string().default('')
      })
    )
    .default([]),
  flows: z
    .array(
      z.object({
        existingId: z.string().nullish(),
        name: z.string(),
        why: z.string().default(''),
        schedule: scheduleSchema.nullish(),
        steps: z.array(stepSchema).min(1)
      })
    )
    .default([]),
  setup: z.array(z.string()).default([])
})

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

function describeSchedule(s?: FlowSchedule): string {
  if (!s) return 'manual'
  if (s.mode === 'interval') return `a cada ${s.everyMinutes} min`
  return `dias ${s.days.join(',')} às ${s.times.join(', ')}`
}

/** Etapas do fluxo na ordem em que rodam a partir do gatilho (e se ele tem ramos, que a edição transforma em linha). */
function flowSteps(flow: Flow, botName: (id?: string) => string | undefined) {
  const trigger = flow.nodes.find((n) => n.type === 'trigger')
  const order: Flow['nodes'] = []
  const seen = new Set<string>()
  const queue = trigger ? [trigger.id] : []
  let branched = false
  while (queue.length) {
    const id = queue.shift()!
    const out = flow.edges.filter((e) => e.source === id)
    if (out.length > 1) branched = true
    for (const e of out) {
      if (seen.has(e.target)) continue
      seen.add(e.target)
      const node = flow.nodes.find((n) => n.id === e.target)
      if (node) order.push(node), queue.push(node.id)
    }
  }
  return {
    ramificado: branched,
    etapas: order.map((n) => ({
      tipo: n.type,
      nome: n.data.label,
      ...(n.type === 'bot' ? { bot: botName(n.data.botId) ?? '?', botId: n.data.botId } : {}),
      mensagem: n.data.message ? clip(n.data.message, 1200) : undefined,
      opcoes: n.data.options?.map((o) => o.label)
    }))
  }
}

/** O que já existe no gBot, com o detalhe necessário para editar. */
function existing() {
  const bots = listBots()
  const name = (id?: string) => bots.find((b) => b.id === id)?.name
  return {
    projetos: listProjects().map((p) => ({ id: p.id, nome: p.name, descricao: p.description, instrucoes: clip(p.instructions, 1500) })),
    bots: bots.map((b) => ({
      id: b.id,
      nome: b.name,
      descricao: b.description,
      modelo: b.model ?? 'default',
      projeto: b.projectId,
      instrucoes: clip(b.instructions, 2500)
    })),
    fluxos: listFlows().map((f) => ({
      id: f.id,
      nome: f.name,
      ligado: f.enabled,
      projeto: f.projectId,
      agenda: describeSchedule(f.nodes.find((n) => n.type === 'trigger')?.data.schedule),
      ...flowSteps(f, name)
    }))
  }
}

const EXAMPLE = {
  title: 'Orçamentos do WhatsApp',
  summary: 'Uma frase dizendo o que o conjunto faz pelo usuário e o que foi testado.',
  project: { name: 'Orçamentos', description: '...', instructions: 'Instruções comuns a tudo do projeto.' },
  bots: [
    {
      ref: 'b1',
      name: 'Atendente WhatsApp',
      description: 'Lê o WhatsApp Web e encontra pedidos de orçamento pendentes',
      instructions: 'Instruções completas do bot, com o caminho que funcionou nos testes...',
      model: 'sonnet',
      why: 'Por que este bot entra no plano.'
    }
  ],
  flows: [
    {
      name: 'Orçamentos pendentes',
      why: 'O que este fluxo resolve.',
      schedule: { mode: 'interval', everyMinutes: 60 },
      steps: [
        { type: 'bot', label: 'Buscar pedidos', bot: 'b1', message: 'Tarefa para o bot...' },
        { type: 'decision', label: 'Tem pedido?', message: 'Critério...', options: ['Há pedidos pendentes', 'Nenhum pedido pendente'] }
      ]
    }
  ],
  setup: ['Abra o navegador do gBot e entre no WhatsApp Web.']
}

/** Recursos do gBot, o que já existe e as regras do plano (criar e editar). */
function planGuide(): string[] {
  return [
    'Recursos do gBot:',
    '- Bot: assistente especializado com nome, descrição de uma frase (começando com verbo) e instruções (o prompt dele). Cada bot:',
    '  • tem memória própria de lições (aprende procedimentos quando erra) e pode receber arquivos de referência;',
    '  • controla o navegador do gBot (Edge/Chrome com perfil próprio, onde o usuário entra uma vez nas contas dele: sites,',
    '    e-mail, sistemas, redes sociais, planilhas online...) e navega, lê, clica, digita e anexa arquivos;',
    '  • cria e edita arquivos na pasta de trabalho e roda comandos (com aprovação do usuário);',
    '  • consulta outros bots quando precisa da especialidade deles;',
    '  • usa um modelo: haiku (rápido e econômico), sonnet (equilíbrio, bom para a maioria), opus (o mais capaz, gasta mais limite).',
    '  Prefira bots focados (uma especialidade cada). Não invente integrações por API: sistemas externos são acessados pelo',
    '  navegador, por arquivos ou por comandos.',
    '- Fluxo: automação que roda sozinha por um gatilho:',
    '  • agenda por horários (dias da semana 0=domingo a 6=sábado e horários "HH:MM") ou por intervalo (a cada N minutos, no',
    '    mínimo 5); sem agenda, só roda quando o usuário mandar;',
    '  • etapas em sequência; o resultado de cada etapa vai junto para a próxima:',
    '    - "bot": manda uma tarefa para um bot;',
    '    - "prompt": instrução direta ao modelo, sem persona (bom para resumir, formatar ou transformar texto);',
    '    - "decision": o modelo lê o resultado anterior e escolhe uma das opções. A PRIMEIRA opção segue para as próximas etapas;',
    '      as outras encerram o fluxo (ex.: ["Há pedidos pendentes", "Nenhum pedido pendente"]).',
    '    - "confirm": pausa o fluxo e manda uma notificação ao usuário com um botão por opção (até 5), mostrando o resultado',
    '      anterior e os arquivos gerados. A PRIMEIRA opção segue; as outras encerram (ex.: ["Enviar", "Não enviar"]). Use',
    '      antes de ações sensíveis ou irreversíveis (enviar mensagem a cliente, publicar, pagar) quando o usuário quiser revisar.',
    '  Fluxos novos são criados desligados: o usuário liga depois de preparar o que precisar.',
    '- Projeto: agrupa bots e fluxos de um mesmo assunto, com instruções comuns. Sugira um projeto novo quando o pedido for um',
    '  assunto próprio com mais de um item; use um existente se combinar; senão, nenhum (null).',
    '',
    'O que já existe no gBot do usuário:',
    '<existente>',
    JSON.stringify(existing()),
    '</existente>',
    '',
    'Editar em vez de criar: quando o usuário pedir para mudar algo que já existe (renomear, trocar a agenda, ajustar instruções,',
    'adicionar ou tirar etapas, trocar o modelo), EDITE o item existente. Nunca crie um novo parecido no lugar.',
    '- Bot: "existingId" + "edit": true + os campos como devem ficar (nome, descrição, instruções COMPLETAS, modelo).',
    '- Projeto: "existingId" + "edit": true + os campos que mudam (nome, descrição, instruções completas).',
    '- Fluxo: "existingId" + nome, agenda e TODAS as etapas como devem ficar. O mesmo fluxo é refeito com essas etapas e',
    '  continua ligado ou desligado como estava. Fluxo com "ramificado": true vira uma sequência ao editar: avise o usuário.',
    '- Bot existente só usado por um fluxo (sem mudar) entra com "existingId", o mesmo nome e sem "edit".',
    'Crie item novo só quando o usuário pedir algo novo.',
    '',
    'O plano segue este exemplo (criação):',
    JSON.stringify(EXAMPLE),
    'Regras do plano:',
    '- Tudo em português, direto e claro. Inclua só o que será criado ou alterado (e os bots que os fluxos usam).',
    '- "bots" lista todos os bots que os fluxos do plano usam. Cada etapa "bot" aponta para o "ref" de um bot da lista.',
    '- Bot novo também pode entrar sem fluxo, quando o pedido for um assistente para conversar.',
    '- "setup": passos curtos que o usuário ainda precisa fazer antes de ligar.',
    '- Seja enxuto: o mínimo de bots e etapas que resolve bem.'
  ]
}

/**
 * Instruções da conversa com o arquiteto (página inicial). Ele conversa, testa de verdade o que for incerto (com
 * permissão do usuário) e só então propõe o plano com `propose_plan`, que aparece no chat com o botão para aplicar.
 */
export function architectPrompt(): string[] {
  return [
    'Você é o arquiteto do gBot, um app de desktop para montar uma equipe de assistentes de IA que trabalha sozinha, usando a',
    'assinatura do usuário. Nesta conversa o usuário conta o que quer automatizar, fazer ou mudar, e você monta com ele o que',
    'criar ou alterar no gBot: bots, fluxos e projeto. Use só os recursos abaixo e reaproveite o que já existe sempre que servir.',
    '',
    ...planGuide(),
    '',
    'Como trabalhar (vale para qualquer tipo de pedido):',
    '1. Entenda o pedido. Se faltar algo que muda o resultado, pergunte com `ask_user` (opções curtas, a recomendada primeiro).',
    '2. Não monte nada no achismo: antes de propor, teste de verdade as partes incertas com as mesmas ferramentas que os bots',
    '   vão usar. Ex.: abrir o site ou sistema no navegador do gBot e ver se o usuário está logado e onde ficam os dados e os',
    '   botões; ler a pasta ou o arquivo que ele citou; rodar um comando de leitura; fazer uma vez o passo principal em modo de',
    '   teste. Teste só o necessário para ter certeza.',
    '3. Antes de testar algo que abre contas do usuário, mexe em arquivos dele ou roda comandos, peça permissão com `ask_user`',
    '   dizendo o que vai fazer (ex.: opções "Pode testar (Recomendado)" e "Não teste, só monte"). Nos testes, nunca faça nada',
    '   irreversível (enviar mensagem, publicar, comprar, pagar, apagar) sem o usuário mandar explicitamente.',
    '4. Se precisar que o usuário faça algo (entrar numa conta no navegador do gBot, escanear um QR code, liberar um acesso),',
    '   explique e espere com `ask_user` (ex.: opção "Já fiz"), depois confira.',
    '5. Conte em poucas linhas o que viu em cada teste e ajuste o plano ao que encontrou.',
    '6. Quando tiver segurança, chame `propose_plan` com o plano. Nas instruções dos bots, escreva o caminho que funcionou nos',
    '   testes (onde entrar, o que procurar, onde clicar, cuidados e formato da resposta). No "summary", diga o que foi testado.',
    '7. O plano aparece para o usuário num cartão com o botão para aplicar: não crie nem altere nada você mesmo. Se ele pedir',
    '   ajustes, ajuste e chame `propose_plan` de novo.'
  ]
}

/** Texto de `gbot_overview`: o que o assistente de qualquer conversa precisa para criar ou alterar itens do gBot. */
export function overviewText(): string {
  return [
    ...planGuide(),
    '',
    'Para aplicar, chame `propose_plan` com o plano: ele aparece para o usuário num cartão com o botão para aplicar. Não crie nem',
    'altere nada você mesmo (nem por arquivos ou comandos).'
  ].join('\n')
}

/** Linha do prompt das conversas sobre criar ou alterar itens do gBot. */
export const GBOT_EDIT_HINT =
  'Para criar ou alterar bots, fluxos ou projetos do gBot, chame `gbot_overview` (mostra o que existe e como montar) e ' +
  'depois `propose_plan`; o usuário confirma num cartão. Pedido para mudar algo que já existe é edição, não item novo.'

/** Confere o plano recebido de `propose_plan`: ids desconhecidos viram itens novos, etapas com bot inexistente saem. */
export function sanitizePlan(raw: unknown): AutomationPlan {
  const parsed = planSchema.parse(raw)
  const botIds = new Set(listBots().map((b) => b.id))
  const projectIds = new Set(listProjects().map((p) => p.id))
  const flowIds = new Set(listFlows().map((f) => f.id))
  const bots = parsed.bots.map((b) => {
    const existingId = b.existingId && botIds.has(b.existingId) ? b.existingId : undefined
    return {
      ref: b.ref,
      existingId,
      edit: existingId && b.edit ? true : undefined,
      name: b.name.slice(0, 40),
      description: b.description.slice(0, 140),
      instructions: b.instructions,
      model: b.model && (MODELS as readonly string[]).includes(b.model) && b.model !== 'default' ? b.model : undefined,
      why: b.why
    }
  })
  const refs = new Set(bots.map((b) => b.ref))
  let project: AutomationPlan['project']
  if (parsed.project && 'existingId' in parsed.project) {
    const p = parsed.project
    if (projectIds.has(p.existingId)) {
      project = p.edit
        ? {
            existingId: p.existingId,
            edit: true,
            name: p.name ?? undefined,
            description: p.description ?? undefined,
            instructions: p.instructions ?? undefined
          }
        : { existingId: p.existingId }
    }
  } else if (parsed.project) project = parsed.project
  return {
    title: parsed.title,
    summary: parsed.summary,
    project,
    bots,
    flows: parsed.flows
      .map((f) => ({
        existingId: f.existingId && flowIds.has(f.existingId) ? f.existingId : undefined,
        name: f.name,
        why: f.why,
        schedule: f.schedule ?? undefined,
        steps: f.steps
          .filter((s) => s.type !== 'bot' || refs.has(s.bot))
          .map((s) => ({ ...s, label: s.label ?? undefined }))
      }))
      .filter((f) => f.steps.length),
    setup: parsed.setup
  }
}
