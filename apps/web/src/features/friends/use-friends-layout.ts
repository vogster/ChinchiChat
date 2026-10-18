import type { FriendsLayout } from './friend-row'

const STORAGE_KEY = 'chinchi.friendsLayout'

/** Cards by default; a list once picked (remembered in this browser). */
export const readFriendsLayout = (): FriendsLayout => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export const saveFriendsLayout = (layout: FriendsLayout) => {
  try {
    if (layout === 'grid') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, layout)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}
