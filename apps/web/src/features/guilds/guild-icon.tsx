import { generatedAvatar } from '../../lib/generated-avatar'
import { useMediaUrl } from '../media/media-base'
import { guildInitials } from './initials'

/**
 * The server's icon; without one, its initials over a picture drawn from its id, so servers
 * differ in colour and still read by name. Fills the (rounded, clipping) container it sits in.
 */
export const GuildIcon = ({
  id,
  name,
  iconUrl,
  className = '',
}: {
  id: string
  name: string
  iconUrl: string | null
  className?: string
}) => {
  const media = useMediaUrl()
  if (iconUrl) {
    return <img src={media(iconUrl)} alt="" aria-hidden className="size-full object-cover" />
  }
  const initials = guildInitials(name)
  return (
    <span aria-hidden className="relative flex size-full items-center justify-center">
      <img
        src={generatedAvatar('guild', id)}
        alt=""
        data-generated
        className="absolute inset-0 size-full object-cover"
      />
      <span
        className={`relative truncate px-1 font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)] ${initials.length > 2 ? 'text-sm' : 'text-base'} ${className}`}
      >
        {initials}
      </span>
    </span>
  )
}
