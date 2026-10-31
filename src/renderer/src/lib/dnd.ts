import { useState, type DragEvent } from 'react'

/** Coisa que dá para arrastar para dentro ou para fora de um projeto. */
export interface ItemRef {
  kind: 'conversation' | 'bot' | 'flow'
  id: string
  /** Projeto onde está agora (ausente = solto). */
  projectId?: string
}

const MIME = 'application/x-gbot-item'

/**
 * O item sendo arrastado. Durante o `dragover` o navegador não deixa ler os dados do arraste,
 * então os alvos consultam este valor para decidir se aceitam.
 */
let current: ItemRef | undefined

export const draggingItem = () => current

/** Props para tornar um elemento arrastável. */
export function draggable(item: ItemRef) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      current = item
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(MIME, JSON.stringify(item))
    },
    onDragEnd: () => {
      current = undefined
    }
  }
}

/** Alvo de soltura: `over` fica true enquanto um item aceito passa por cima. */
export function useDrop(accept: (item: ItemRef) => boolean, onDrop: (item: ItemRef) => void) {
  const [over, setOver] = useState(false)
  const props = {
    onDragOver: (e: DragEvent) => {
      if (!current || !accept(current)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!over) setOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      // Ignora a saída para um filho do próprio alvo.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      setOver(false)
      const item = current
      current = undefined
      if (!item || !accept(item)) return
      e.preventDefault()
      e.stopPropagation()
      onDrop(item)
    }
  }
  return { over, props }
}
