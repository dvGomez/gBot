import { useSyncExternalStore } from 'react'

/** Relógio único (~8 fps) compartilhado por todos os avatares animados. */
const TICK_MS = 120
let tick = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      tick++
      listeners.forEach((l) => l())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useTick(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribe : noopSubscribe, () => (enabled ? tick : 0))
}

const noopSubscribe = () => () => {}
