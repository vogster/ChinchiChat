import { has, parsePermissions } from '@chinchi/shared'

import type { OverwriteState } from './tri-state-permission'
import type { PermissionOverwrite } from '@chinchi/shared'

/** An overwrite being edited, as bit fields. */
export interface OverwriteDraft {
  readonly allow: bigint
  readonly deny: bigint
}

export const EMPTY_DRAFT: OverwriteDraft = { allow: 0n, deny: 0n }

export const draftOf = (overwrite: PermissionOverwrite | undefined): OverwriteDraft =>
  overwrite
    ? { allow: parsePermissions(overwrite.allow), deny: parsePermissions(overwrite.deny) }
    : EMPTY_DRAFT

export const stateOf = (draft: OverwriteDraft, flag: bigint): OverwriteState =>
  has(draft.allow, flag) ? 'allow' : has(draft.deny, flag) ? 'deny' : 'inherit'

export const withState = (
  draft: OverwriteDraft,
  flag: bigint,
  state: OverwriteState,
): OverwriteDraft => ({
  allow: state === 'allow' ? draft.allow | flag : draft.allow & ~flag,
  deny: state === 'deny' ? draft.deny | flag : draft.deny & ~flag,
})

export const sameDraft = (a: OverwriteDraft, b: OverwriteDraft) =>
  a.allow === b.allow && a.deny === b.deny

/** Whether two channels carry the same overwrites, whatever their order. */
export const sameOverwrites = (
  a: readonly PermissionOverwrite[],
  b: readonly PermissionOverwrite[],
): boolean => {
  const key = (o: PermissionOverwrite) => `${o.targetType}:${o.targetId}:${o.allow}:${o.deny}`
  const left = new Set(a.map(key))
  return a.length === b.length && b.every((o) => left.has(key(o)))
}
