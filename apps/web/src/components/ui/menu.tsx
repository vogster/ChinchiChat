import * as Dropdown from '@radix-ui/react-dropdown-menu'

import type { ReactNode } from 'react'

export const Menu = Dropdown.Root
export const MenuTrigger = Dropdown.Trigger

export const MenuContent = ({ children }: { children: ReactNode }) => (
  <Dropdown.Portal>
    <Dropdown.Content
      align="start"
      sideOffset={4}
      className="z-50 w-56 rounded-md bg-rail p-1.5 text-sm text-text shadow-xl"
    >
      {children}
    </Dropdown.Content>
  </Dropdown.Portal>
)

export interface MenuItemProps {
  readonly onSelect: () => void
  readonly icon?: ReactNode
  readonly danger?: boolean
  /** Spoken name when the visible content (e.g. a lone emoji) is not enough. */
  readonly label?: string
  readonly children: ReactNode
}

const itemClass =
  'flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 outline-none select-none'

export const MenuItem = ({ onSelect, icon, danger = false, label, children }: MenuItemProps) => (
  <Dropdown.Item
    onSelect={onSelect}
    aria-label={label}
    className={`${itemClass} ${danger ? 'text-red-400 data-[highlighted]:bg-red-600 data-[highlighted]:text-white' : 'data-[highlighted]:bg-accent data-[highlighted]:text-accent-contrast'}`}
  >
    <span>{children}</span>
    {icon}
  </Dropdown.Item>
)

export const MenuSeparator = () => <Dropdown.Separator className="mx-1 my-1 h-px bg-border" />
