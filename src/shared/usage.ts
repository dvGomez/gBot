import type { TokenUsage } from './types'

export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })

export function addUsage(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  const base = a ?? emptyUsage()
  return {
    input: base.input + b.input,
    output: base.output + b.output,
    cacheRead: base.cacheRead + b.cacheRead,
    cacheWrite: base.cacheWrite + b.cacheWrite,
    cost: base.cost + b.cost
  }
}

/** Todos os tokens processados (entrada, cache e saída). */
export const totalTokens = (u: TokenUsage) => u.input + u.output + u.cacheRead + u.cacheWrite
