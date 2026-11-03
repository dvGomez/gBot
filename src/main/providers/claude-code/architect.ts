import { z } from 'zod'
import type { AutomationPlan, Flow, FlowSchedule } from '@shared/types'
import { triggerName, triggersOf } from '@shared/flows'
import { listFlows } from '../../flows/store'
import { listBots, listProjects, listSpecializations } from '../../store'

/**
 * Arquiteto do gBot: monta com o usuário o que criar ou mudar (especializações, bots com rotinas, projeto) e propõe com
 * `propose_plan`, que aparece no chat num cartão. Na página inicial é uma conversa própria, que testa de verdade antes de
 * propor; nas outras conversas, o assistente consulta o que existe com `gbot_overview` e propõe do mesmo jeito. Só
 * propõe: quem cria ou altera é a interface, depois que o usuário aceita.
 */

const MODELS = ['default', 'haiku', 'sonnet', 'opus'] as const

const scheduleSchema = z.union([
  z.object({ mode: z.literal('times'), days: z.array(z.number().int().min(0).max(6)), times: z.array(z.string().regex(/^\d{2}:\d{2}$/)) }),
  z.object({ mode: z.literal('interval'), everyMinutes: z.number().int().min(5) })
])

const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task'), label: z.string().nullish(), specialization: z.string().nullish(), message: z.string().default('') }),
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
  specializations: z
    .array(
      z.object({
        ref: z.string(),
        existingId: z.string().nullish(),
        edit: z.boolean().nullish(),
        name: z.string(),
        description: z.string().default(''),
        instructions: z.string().default(''),
        why: z.string().default('')
      })
    )
    .default([]),
  bots: z
    .array(
      z.object({
        ref: z.string(),
        existingId: z.string().nullish(),
        edit: z.boolean().nullish(),
        name: z.string(),
        description: z.string().default(''),
        instructions: z.string().default(''),
        specializations: z.array(z.string()).default([]),
        model: z.string().nullish(),
        why: z.string().default(''),
        routines: z
          .array(
            z.object({
              existingId: z.string().nullish(),
              name: z.string(),
              why: z.string().default(''),
              schedule: scheduleSchema.nullish(),
              steps: z.array(stepSchema).min(1)
            })
          )
          .default([])
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

/** Etapas da rotina na ordem em que rodam a partir do gatilho (e se ela tem ramos, que a edição transforma em linha). */
function routineSteps(flow: Flow, triggerId: string, specName: (id?: string) => string | undefined) {
  const order: Flow['nodes'] = []
  const seen = new Set<string>()
  const queue = [triggerId]
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
    ramificada: branched,
    etapas: order.map((n) => ({
      tipo: n.type,
      nome: n.data.label,
      ...(n.type === 'task' && n.data.specializationId
        ? { especializacao: specName(n.data.specializationId) ?? '?', especializacaoId: n.data.specializationId }
        : {}),
      mensagem: n.data.message ? clip(n.data.message, 1200) : undefined,
      opcoes: n.data.options?.map((o) => o.label)
    }))
  }
}

/** O que já existe no gBot, com o detalhe necessário para editar. */
function existing() {
  const specs = listSpecializations()
  const specName = (id?: string) => specs.find((sp) => sp.id === id)?.name
  const flows = listFlows()
  return {
    projetos: listProjects().map((p) => ({ id: p.id, nome: p.name, descricao: p.description, instrucoes: clip(p.instructions, 1500) })),
    especializacoes: specs.map((sp) => ({
      id: sp.id,
      nome: sp.name,
      descricao: sp.description,
      projeto: sp.projectId,
      instrucoes: clip(sp.instructions, 2500)
    })),
    bots: listBots().map((b) => ({
      id: b.id,
      nome: b.name,
      descricao: b.description,
      modelo: b.model ?? 'default',
      projeto: b.projectId,
      instrucoes: clip(b.instructions, 1500),
      especializacoes: b.specializationIds.map((id) => ({ id, nome: specName(id) })),
      // Cada gatilho do fluxo do bot é uma rotina.
      rotinas: flows
        .filter((f) => f.botId === b.id)
        .flatMap((f) =>
          triggersOf(f).map((t) => ({
            id: t.id,
            nome: triggerName(t),
            ligada: !!t.data.enabled,
            agenda: describeSchedule(t.data.schedule),
            ...routineSteps(f, t.id, specName)
          }))
        )
    }))
  }
}

const EXAMPLE = {
  title: 'Orçamentos do WhatsApp',
  summary: 'Uma frase dizendo o que o conjunto faz pelo usuário e o que foi testado.',
  project: { name: 'Orçamentos', description: '...', instructions: 'Instruções comuns a tudo do projeto.' },
  specializations: [
    {
      ref: 's1',
      name: 'Atendimento no WhatsApp Web',
      description: 'Lê o WhatsApp Web e encontra pedidos de orçamento pendentes',
      instructions: 'Instruções completas, com o caminho que funcionou nos testes...',
      why: 'Por que esta especialização entra no plano.'
    }
  ],
  bots: [
    {
      ref: 'b1',
      name: 'Lia',
      description: 'Cuida dos pedidos de orçamento que chegam pelo WhatsApp',
      instructions: 'Personalidade e orientações gerais (opcional): tom, prioridades, o que nunca fazer.',
      specializations: ['s1'],
      model: 'sonnet',
      why: 'Por que este bot entra no plano.',
      routines: [
        {
          name: 'Orçamentos pendentes',
          why: 'O que esta rotina resolve.',
          schedule: { mode: 'interval', everyMinutes: 60 },
          steps: [
            { type: 'task', label: 'Buscar pedidos', specialization: 's1', message: 'Tarefa desta etapa...' },
            { type: 'decision', label: 'Tem pedido?', message: 'Critério...', options: ['Há pedidos pendentes', 'Nenhum pedido pendente'] }
          ]
        }
      ]
    }
  ],
  setup: ['Abra o navegador do gBot e entre no WhatsApp Web.']
}

/** Recursos do gBot, o que já existe e as regras do plano (criar e editar). */
function planGuide(): string[] {
  return [
    'Recursos do gBot:',
    '- Especialização: um conhecimento ou procedimento reutilizável (ex.: "Consultar pull requests", "Revisar contratos").',
    '  Tem nome, descrição de uma frase (começando com verbo) e instruções (o passo a passo, cuidados e formato da resposta).',
    '  Pode receber arquivos de referência e aprende lições quando um bot erra ao usá-la. Não roda sozinha: quem usa é um bot.',
    '  Prefira especializações focadas (um assunto cada), para vários bots poderem reaproveitar.',
    '- Bot: um membro vivo do time, com nome, avatar, personalidade (instruções opcionais) e as especializações que usa. Cada bot:',
    '  • faz uma tarefa por vez e tem memória própria de lições;',
    '  • controla o navegador do gBot (Edge/Chrome com perfil próprio, onde o usuário entra uma vez nas contas dele: sites,',
    '    e-mail, sistemas, redes sociais, planilhas online...) e navega, lê, clica, digita e anexa arquivos;',
    '  • cria e edita arquivos na pasta de trabalho e roda comandos (com aprovação do usuário);',
    '  • conversa com o usuário e consulta outros bots quando precisa;',
    '  • usa um modelo: haiku (rápido e econômico), sonnet (equilíbrio, bom para a maioria), opus (o mais capaz, gasta mais limite);',
    '  • tem um fluxo (canvas) com uma ou mais rotinas; cada rotina é um gatilho do fluxo com as etapas ligadas a ele:',
    '    - agenda por horários (dias da semana 0=domingo a 6=sábado e horários "HH:MM") ou por intervalo (a cada N minutos, no',
    '      mínimo 5); sem agenda, só roda quando o usuário mandar;',
    '    - etapas em sequência; o resultado de cada etapa vai junto para a próxima:',
    '      · "task": o bot faz uma tarefa, opcionalmente com uma das especializações (o "ref" dela em "specialization");',
    '      · "decision": o modelo lê o resultado anterior e escolhe uma das opções. A PRIMEIRA opção segue para as próximas',
    '        etapas; as outras encerram a rotina (ex.: ["Há pedidos pendentes", "Nenhum pedido pendente"]);',
    '      · "confirm": pausa a rotina e manda uma notificação ao usuário com um botão por opção (até 5), mostrando o resultado',
    '        anterior e os arquivos gerados. A PRIMEIRA opção segue; as outras encerram (ex.: ["Enviar", "Não enviar"]). Use',
    '        antes de ações sensíveis ou irreversíveis (enviar mensagem a cliente, publicar, pagar) quando o usuário quiser revisar.',
    '    Rotinas novas são criadas desligadas: o usuário liga depois de preparar o que precisar.',
    '  Não invente integrações por API: sistemas externos são acessados pelo navegador, por arquivos ou por comandos.',
    '- Projeto: agrupa bots e especializações de um mesmo assunto, com instruções comuns. Sugira um projeto novo quando o',
    '  pedido for um assunto próprio com mais de um item; use um existente se combinar; senão, nenhum (null).',
    '',
    'O que já existe no gBot do usuário:',
    '<existente>',
    JSON.stringify(existing()),
    '</existente>',
    '',
    'Editar em vez de criar: quando o usuário pedir para mudar algo que já existe (renomear, trocar a agenda, ajustar instruções,',
    'adicionar ou tirar etapas, trocar o modelo), EDITE o item existente. Nunca crie um novo parecido no lugar.',
    '- Especialização: "existingId" + "edit": true + os campos como devem ficar (nome, descrição, instruções COMPLETAS).',
    '  Especialização existente só reaproveitada (sem mudar) entra com "existingId", o mesmo nome e sem "edit".',
    '- Bot: "existingId" + "edit": true + os campos como devem ficar (nome, descrição, instruções, modelo). Sem "edit", o bot',
    '  existente só ganha as especializações e as rotinas do plano. As especializações listadas são somadas às que ele já tem.',
    '- Rotina: dentro do bot dono, "existingId" + nome, agenda e TODAS as etapas como devem ficar. A mesma rotina é refeita com',
    '  essas etapas e continua ligada ou desligada como estava. Rotina com "ramificada": true vira uma sequência ao editar:',
    '  avise o usuário.',
    '- Projeto: "existingId" + "edit": true + os campos que mudam (nome, descrição, instruções completas).',
    'Crie item novo só quando o usuário pedir algo novo.',
    '',
    'O plano segue este exemplo (criação):',
    JSON.stringify(EXAMPLE),
    'Regras do plano:',
    '- Use o idioma preferido pelo usuário, direto e claro. Inclua só o que será criado ou alterado (e as especializações que',
    '  os bots e as etapas do plano usam).',
    '- "specializations" lista todas as especializações usadas no plano. Os bots e as etapas "task" apontam para o "ref" delas.',
    '- Bot novo ganha um nome de pessoa ou apelido simpático (não um cargo). Bot novo também pode entrar sem rotina, quando o',
    '  pedido for um assistente para conversar.',
    '- "setup": passos curtos que o usuário ainda precisa fazer antes de ligar.',
    '- Seja enxuto: o mínimo de especializações, bots e etapas que resolve bem.'
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
    'criar ou alterar no gBot: especializações, bots (com rotinas) e projeto. Use só os recursos abaixo e reaproveite o que já',
    'existe sempre que servir.',
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
    '6. Quando tiver segurança, chame `propose_plan` com o plano. Nas instruções das especializações, escreva o caminho que funcionou nos',
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
  'Para criar ou alterar bots, rotinas, especializações ou projetos do gBot, chame `gbot_overview` (mostra o que existe e como montar) e ' +
  'depois `propose_plan`; o usuário confirma num cartão. Pedido para mudar algo que já existe é edição, não item novo.'

/**
 * Confere o plano recebido de `propose_plan`: ids desconhecidos viram itens novos, referências a especializações que não
 * estão no plano saem.
 */
export function sanitizePlan(raw: unknown): AutomationPlan {
  const parsed = planSchema.parse(raw)
  const specIds = new Set(listSpecializations().map((sp) => sp.id))
  const bots = listBots()
  const botIds = new Set(bots.map((b) => b.id))
  const projectIds = new Set(listProjects().map((p) => p.id))
  const flows = listFlows()
  const specializations = parsed.specializations.map((sp) => {
    const existingId = sp.existingId && specIds.has(sp.existingId) ? sp.existingId : undefined
    return {
      ref: sp.ref,
      existingId,
      edit: existingId && sp.edit ? true : undefined,
      name: sp.name.slice(0, 60),
      description: sp.description.slice(0, 140),
      instructions: sp.instructions,
      why: sp.why
    }
  })
  const refs = new Set(specializations.map((sp) => sp.ref))
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
    specializations,
    bots: parsed.bots.map((b) => {
      const existingId = b.existingId && botIds.has(b.existingId) ? b.existingId : undefined
      return {
        ref: b.ref,
        existingId,
        edit: existingId && b.edit ? true : undefined,
        name: b.name.slice(0, 40),
        description: b.description.slice(0, 140),
        instructions: b.instructions,
        specializations: b.specializations.filter((r) => refs.has(r)),
        model: b.model && (MODELS as readonly string[]).includes(b.model) && b.model !== 'default' ? b.model : undefined,
        why: b.why,
        routines: b.routines
          .map((r) => ({
            // Rotina existente só vale se for do próprio bot.
            existingId:
              r.existingId && existingId && flows.some((f) => f.botId === existingId && triggersOf(f).some((t) => t.id === r.existingId))
                ? r.existingId
                : undefined,
            name: r.name,
            why: r.why,
            schedule: r.schedule ?? undefined,
            steps: r.steps.map((s) =>
              s.type === 'task'
                ? { type: 'task' as const, label: s.label ?? undefined, message: s.message, specialization: s.specialization && refs.has(s.specialization) ? s.specialization : undefined }
                : { ...s, label: s.label ?? undefined }
            )
          }))
          .filter((r) => r.steps.length)
      }
    }),
    setup: parsed.setup
  }
}
