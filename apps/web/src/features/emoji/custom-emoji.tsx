import { CUSTOM_EMOJI_PATTERN, customEmojiUrl } from '@chinchi/shared'

/** A server emoji as a picture; `:name:` is its text for screen readers and copying. */
export const CustomEmoji = ({
  id,
  name,
  className = 'size-[1.375em]',
}: {
  id: string
  name: string
  className?: string
}) => (
  <img
    src={customEmojiUrl(id)}
    alt={`:${name}:`}
    title={`:${name}:`}
    loading="lazy"
    draggable={false}
    className={`inline-block align-[-0.3em] object-contain ${className}`}
  />
)

/** A reaction or picker emoji: a server emoji `<:name:id>` as its picture, Unicode as text. */
export const EmojiGlyph = ({ emoji }: { emoji: string }) => {
  const match = CUSTOM_EMOJI_PATTERN.exec(emoji)
  return match ? <CustomEmoji id={match[3] as string} name={match[2] as string} /> : <>{emoji}</>
}
