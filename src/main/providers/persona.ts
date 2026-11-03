import type { Bot, MemoryOwner, SendMessageRequest, Specialization } from '@shared/types'
import { lessonLines, memoryPrompt } from '../memory'
import { specializationFilesAccess, specializationFilesPrompt } from '../specializationFiles'
import { getBot, getSpecialization } from '../store'

/**
 * Como um bot aparece para o modelo: personalidade, as especializações que ele usa (instruções, arquivos de referência e
 * lições de cada uma) e a memória dele. Vale para todos os provedores e para bots consultados ou @mencionados.
 */

type BotRef = Pick<Bot, 'id' | 'name' | 'description' | 'instructions'>

const resolve = (ids: string[]) => ids.map((id) => getSpecialization(id)).filter((sp): sp is Specialization => !!sp)

/** Especializações que o bot usa (as cadastradas nele, que existam). */
export const botSpecializations = (botId: string): Specialization[] => resolve(getBot(botId)?.specializationIds ?? [])

/** Bloco de uma especialização para o prompt (ou para a mensagem, quando chamada com /). */
export function specializationBlock(sp: Specialization): string[] {
  const lessons = lessonLines({ kind: 'specialization', id: sp.id })
  return [
    `<especializacao nome="${sp.name}">`,
    ...(sp.description ? [sp.description] : []),
    sp.instructions.trim(),
    ...specializationFilesPrompt(sp.id),
    ...(lessons.length ? ['Procedimentos já aprendidos nesta especialização:', ...lessons] : []),
    '</especializacao>'
  ]
}

/** Linhas do prompt de sistema de quem o bot é e do que ele sabe fazer. */
export function botPromptLines(bot: BotRef): string[] {
  const specs = botSpecializations(bot.id)
  return [
    `Você é o bot "${bot.name}"${bot.description ? `: ${bot.description}` : ''}, um membro do time do usuário no gBot.`,
    ...(bot.instructions.trim()
      ? ['Sua personalidade e orientações, definidas pelo usuário:', '<instrucoes_do_bot>', bot.instructions.trim(), '</instrucoes_do_bot>']
      : []),
    ...(specs.length
      ? [
          'Suas especializações (o que você sabe fazer; siga as instruções da que combinar com o pedido):',
          ...specs.flatMap(specializationBlock)
        ]
      : [])
  ]
}

/** Especializações chamadas só nesta mensagem (com / ou por uma etapa de rotina) que o bot ainda não tem. */
function extraSpecializations(req: SendMessageRequest): Specialization[] {
  const own = new Set(req.bot ? (getBot(req.bot.id)?.specializationIds ?? []) : [])
  return resolve((req.specializationIds ?? []).filter((id) => !own.has(id)))
}

/** Texto da mensagem com as especializações chamadas nela (as que não estão no prompt de sistema). */
export function withSpecializations(req: SendMessageRequest, text: string): string {
  const extra = extraSpecializations(req)
  if (!extra.length) return text
  return [
    '[Especializações chamadas pelo usuário para esta mensagem; siga as instruções delas:]',
    ...extra.flatMap(specializationBlock),
    '',
    text
  ].join('\n')
}

/** Ids de todas as especializações em uso na mensagem (as do bot e as chamadas nela). */
export function specializationsInUse(req: SendMessageRequest): string[] {
  const own = req.bot ? (getBot(req.bot.id)?.specializationIds ?? []) : []
  return [...new Set([...own, ...(req.specializationIds ?? [])])].filter((id) => getSpecialization(id))
}

/** Pastas de arquivos de referência que a sessão pode ler. */
export const specializationAccess = (req: SendMessageRequest) => specializationFilesAccess(specializationsInUse(req))

/**
 * Memória da mensagem: a do bot; sem bot, a da única especialização chamada (se houver uma só). Conversa normal não tem
 * memória.
 */
export function memoryOf(req: SendMessageRequest): MemoryOwner | undefined {
  if (req.bot) return { kind: 'bot', id: req.bot.id }
  const ids = specializationsInUse(req)
  return ids.length === 1 ? { kind: 'specialization', id: ids[0] } : undefined
}

/** Bloco de memória do prompt de sistema. */
export const memoryLines = (req: SendMessageRequest) => memoryPrompt(memoryOf(req), specializationsInUse(req).length > 0 && !!req.bot)
