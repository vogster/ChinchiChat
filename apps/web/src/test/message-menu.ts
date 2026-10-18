import { fireEvent, screen } from '@testing-library/react'

/** Right-clicks a message row and returns its actions menu (what a long press does on a phone). */
export const openMessageMenu = async (row: HTMLElement) => {
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 })
  return screen.findByRole('menu', { name: 'Действия с сообщением' })
}
