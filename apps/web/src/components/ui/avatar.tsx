import { generatedAvatar } from '../../lib/generated-avatar'

/**
 * A user's picture; without one, a picture drawn from their id (the same everywhere), or the
 * first letter of their name when there is no id either (a deleted user). Decorative.
 */
export const Avatar = ({
  name,
  src,
  id,
  className = 'size-10',
  rounded = 'rounded-full',
}: {
  name: string
  src: string | null
  /** The user's id, for the drawn picture. */
  id?: string | null | undefined
  /** Size utilities, e.g. `size-8`. */
  className?: string
  /** The corner radius: a circle, or a squircle such as `rounded-[14px]` for 40px. */
  rounded?: string
}) => {
  if (src || id) {
    return (
      <img
        src={src ?? generatedAvatar('user', id as string)}
        alt=""
        aria-hidden
        loading="lazy"
        data-generated={src ? undefined : true}
        className={`shrink-0 ${rounded} bg-elevated object-cover ${className}`}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${rounded} bg-accent font-semibold text-accent-contrast ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
