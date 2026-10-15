import { useState } from 'react'

import type { DragEvent, KeyboardEvent } from 'react'

/** Marks where a dragged item would land, and dims the one being dragged. */
export const dropTargetClass =
  'rounded data-[drop-target=true]:outline-2 data-[drop-target=true]:outline-accent data-[dragging=true]:opacity-50'

export interface DragSortOptions {
  /** Something was dropped on `targetId`. */
  readonly onDrop: (draggedId: string, targetId: string) => void
  /** Alt+↑ / Alt+↓ on an item: move it one place (-1 up, 1 down), for keyboard users. */
  readonly onStep?: (id: string, step: -1 | 1) => void
}

export interface DragSortItem {
  /** Whether the item can be picked up (it can always take drops while something is dragged). */
  readonly draggable?: boolean
}

/**
 * Native HTML drag and drop for a sortable list, plus Alt+arrow keys. The dragged id is kept in
 * state rather than in dataTransfer, so it also works where dataTransfer is unavailable.
 */
export const useDragSort = ({ onDrop, onStep }: DragSortOptions) => {
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const finish = () => {
    setDragged(null)
    setOver(null)
  }

  const itemProps = (id: string, { draggable = true }: DragSortItem = {}) => ({
    draggable: draggable || undefined,
    'aria-keyshortcuts': draggable && onStep ? 'Alt+ArrowUp Alt+ArrowDown' : undefined,
    'data-dragging': dragged === id || undefined,
    'data-drop-target': (dragged !== null && dragged !== id && over === id) || undefined,
    onDragStart: draggable
      ? (event: DragEvent) => {
          event.stopPropagation()
          event.dataTransfer?.setData('text/plain', id)
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
          setDragged(id)
        }
      : undefined,
    onDragOver: (event: DragEvent) => {
      if (dragged === null) return
      event.preventDefault()
      event.stopPropagation()
      if (over !== id) setOver(id)
    },
    onDragLeave: () => setOver((current) => (current === id ? null : current)),
    onDrop: (event: DragEvent) => {
      if (dragged === null) return
      event.preventDefault()
      event.stopPropagation()
      if (dragged !== id) onDrop(dragged, id)
      finish()
    },
    onDragEnd: finish,
    onKeyDown:
      draggable && onStep
        ? (event: KeyboardEvent) => {
            if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
            event.preventDefault()
            onStep(id, event.key === 'ArrowUp' ? -1 : 1)
          }
        : undefined,
  })

  return { dragging: dragged !== null, itemProps }
}

export type DragItemProps = ReturnType<ReturnType<typeof useDragSort>['itemProps']>
