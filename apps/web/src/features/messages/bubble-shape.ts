/** Where a message sits in its author's run: alone, or first, in the middle or last of it. */
export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

export const groupPosition = (startsGroup: boolean, endsGroup: boolean): GroupPosition =>
  startsGroup ? (endsGroup ? 'single' : 'first') : endsGroup ? 'last' : 'middle'

/**
 * Corners of a bubble, "messenger" style: round on the outside, tight where bubbles of one run
 * meet, and a sharper tail at the run's last bubble, on the author's side.
 */
const OTHER: Readonly<Record<GroupPosition, string>> = {
  single: 'rounded-[20px_20px_20px_6px]',
  first: 'rounded-[20px_20px_20px_8px]',
  middle: 'rounded-[8px_20px_20px_8px]',
  last: 'rounded-[8px_20px_20px_6px]',
}

const MINE: Readonly<Record<GroupPosition, string>> = {
  single: 'rounded-[20px_20px_6px_20px]',
  first: 'rounded-[20px_20px_8px_20px]',
  middle: 'rounded-[20px_8px_8px_20px]',
  last: 'rounded-[20px_8px_6px_20px]',
}

export const bubbleShape = (mine: boolean, position: GroupPosition) =>
  (mine ? MINE : OTHER)[position]
