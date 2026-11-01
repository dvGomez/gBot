import { z } from 'zod'
import type { AutomationPlan, FlowSchedule } from '@shared/types'
import { listFlows } from '../../flows/store'
import { listBots, listProjects } from '../../store'

/**
 * Arquiteto da página inicial: uma conversa em que o Claude entende o pedido, testa de verdade o que for incerto (com
 * as ferramentas do gBot e a permissão do usuário) e propõe o conjunto de bots, fluxos e projeto. Só propõe: quem cria
 * é a interface, depois que o usuário aceita.
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
      z.object({ existingId: z.string() }),
      z.object({ name: z.string(), description: z.string().default(''), instructions: z.string().default('') })
    ])
    .nullish(),
  bots: z.array(
    z.object({
      ref: z.string(),
      existingId: z.string().nullish(),
      name: z.string(),
      description: z.string().default(''),
      instructions: z.string().default(''),
      model: z.string().nullish(),
      why: z.string().default('')
    })
  ),
  flows: z.array(z.object({ name: z.string(), why: z.string().default(''), schedule: scheduleSchema.nullish(), steps: z.array(stepSchema).min(1) })),
  setup: z.array(z.string()).default([])
})

function describeSchedule(s?: FlowSchedule): string {
  if (!s) return 'manual'
  if (s.mode === 'interval') return `a cada ${s.everyMinutes} min`
  return `dias ${s.days.join(',')} às ${s.times.join(', ')}`
}

/** O que já existe no gBot, resumido para o prompt. */
function existing() {
  const bots = listBots()
  const name = (id?: string) => bots.find((b) => b.id === id)?.name
  return {
    projetos: listProjects().map((p) => ({ id: p.id, nome: p.name, descricao: p.description })),
    bots: bots.map((b) => ({ id: b.id, nome: b.name, descricao: b.description, modelo: b.model ?? 'default', projeto: b.projectId })),
    fluxos: listFlows().map((f) => ({
      nome: f.name,
      ligado: f.enabled,
      projeto: f.projectId,
      agenda: describeSchedule(f.nodes.find((n) => n.type === 'trigger')?.data.schedule),
      etapas: f.nodes
        .filter((n) => n.type !== 'trigger')
        .map((n) => (n.type === 'bot' ? `bot ${name(n.data.botId) ?? '?'}` : n.type))
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

/**
 * Instruções da conversa com o arquiteto (página inicial). Ele conversa, testa de verdade o que for incerto (com
 * permissão do usuário) e só então propõe o plano com `propose_plan`, que aparece no chat com o botão "Criar tudo".
 */
export function architectPrompt(): string[] {
  return [
    'Você é o arquiteto do gBot, um app de desktop para montar uma equipe de assistentes de IA que trabalha sozinha, usando a',
    'assinatura do usuário. Nesta conversa o usuário conta o que quer automatizar ou fazer, e você monta com ele o que criar no',
    'gBot: bots, fluxos e projeto. Use só os recursos abaixo e reaproveite o que já existe sempre que servir.',
    '',
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
    '  Os fluxos são criados desligados: o usuário liga depois de preparar o que precisar.',
    '- Projeto: agrupa bots e fluxos de um mesmo assunto, com instruções comuns. Sugira um projeto novo quando o pedido for um',
    '  assunto próprio com mais de um item; use um existente se combinar; senão, nenhum (null).',
    '',
    'O que já existe no gBot do usuário (reaproveite com "existingId" em vez de criar outro parecido):',
    '<existente>',
    JSON.stringify(existing()),
    '</existente>',
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
    '7. O plano aparece para o usuário num cartão com o botão "Criar tudo": não crie nada você mesmo. Se ele pedir ajustes,',
    '   ajuste e chame `propose_plan` de novo.',
    '',
    'O plano segue este exemplo:',
    JSON.stringify(EXAMPLE),
    'Regras do plano:',
    '- Tudo em português, direto e claro.',
    '- "bots" lista todos os bots que os fluxos usam: os novos e os existentes reaproveitados (existentes levam "existingId" e o',
    '  mesmo nome; "instructions" pode ficar vazio para eles). Cada etapa "bot" aponta para o "ref" de um bot da lista.',
    '- Bot novo também pode entrar sem fluxo, quando o pedido for um assistente para conversar.',
    '- "setup": passos curtos que o usuário ainda precisa fazer antes de ligar. Não repita o que já ficou pronto nos testes.',
    '- Seja enxuto: o mínimo de bots e etapas que resolve bem.'
  ]
}

/** Confere o plano recebido de `propose_plan`: ids desconhecidos viram itens novos, etapas com bot inexistente saem. */
export function sanitizePlan(raw: unknown): AutomationPlan {
  const parsed = planSchema.parse(raw)
  const botIds = new Set(listBots().map((b) => b.id))
  const projectIds = new Set(listProjects().map((p) => p.id))
  const bots = parsed.bots.map((b) => ({
    ref: b.ref,
    existingId: b.existingId && botIds.has(b.existingId) ? b.existingId : undefined,
    name: b.name.slice(0, 40),
    description: b.description.slice(0, 140),
    instructions: b.instructions,
    model: b.model && (MODELS as readonly string[]).includes(b.model) && b.model !== 'default' ? b.model : undefined,
    why: b.why
  }))
  const refs = new Set(bots.map((b) => b.ref))
  const project =
    parsed.project && 'existingId' in parsed.project
      ? projectIds.has(parsed.project.existingId)
        ? { existingId: parsed.project.existingId }
        : undefined
      : (parsed.project ?? undefined)
  return {
    title: parsed.title,
    summary: parsed.summary,
    project,
    bots,
    flows: parsed.flows
      .map((f) => ({
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
