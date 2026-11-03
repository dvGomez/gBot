import type { Flow, FlowNode } from './types'

/** Gatilhos do fluxo, de cima para baixo no canvas (cada um é uma rotina do bot). */
export const triggersOf = (flow?: Flow): FlowNode[] =>
  (flow?.nodes ?? []).filter((n) => n.type === 'trigger').sort((a, b) => a.position.y - b.position.y)

/** Gatilhos que disparam sozinhos pela agenda. */
export const activeTriggers = (flow?: Flow): FlowNode[] => triggersOf(flow).filter((t) => t.data.enabled && t.data.schedule)

/** Nome do gatilho (o padrão vem traduzido pela interface). */
export const triggerName = (node: FlowNode, fallback = 'Gatilho'): string => node.data.label?.trim() || fallback

/** Caixinhas alcançáveis a partir de um gatilho (sem o próprio gatilho). */
export function reachableFrom(flow: Flow, triggerId: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const e of flow.edges) children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  const seen = new Set<string>()
  const stack = [triggerId]
  while (stack.length) {
    for (const c of children.get(stack.pop()!) ?? []) if (!seen.has(c)) seen.add(c), stack.push(c)
  }
  return seen
}
