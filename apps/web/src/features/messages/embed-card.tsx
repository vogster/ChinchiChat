import { isSafeUrl } from '@chinchi/markdown'

import { useMediaUrl } from '../media/media-base'

/** Preview pictures are stored by this server (a path here) or, at worst, plain https. */
const isImageUrl = (url: string) =>
  (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) || isSafeUrl(url)

import type { Embed } from '@chinchi/shared'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * A link preview made by the server; the image comes from this instance, not the site. The
 * real host is shown next to the page's own site name, which the page can set to anything.
 */
export const EmbedCard = ({ embed }: { embed: Embed }) => {
  const title = embed.title ?? embed.url
  const host = hostOf(embed.url)
  const media = useMediaUrl()
  return (
    <article
      aria-label={title}
      className="mt-1 flex max-w-lg flex-col gap-1 rounded-md border-l-4 border-accent bg-field p-3"
    >
      <p className="flex gap-1.5 text-xs text-muted">
        {embed.siteName ? <span>{embed.siteName}</span> : null}
        {host ? <span>{host}</span> : null}
      </p>
      {isSafeUrl(embed.url) ? (
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="font-semibold text-accent hover:underline"
        >
          {title}
        </a>
      ) : (
        <p className="font-semibold">{title}</p>
      )}
      {embed.description ? (
        <p className="line-clamp-3 text-sm break-words">{embed.description}</p>
      ) : null}
      {embed.image && isImageUrl(embed.image.url) ? (
        <img
          data-native-menu
          src={media(embed.image.url)}
          width={embed.image.width}
          height={embed.image.height}
          alt=""
          loading="lazy"
          className="mt-1 h-auto max-w-full rounded"
        />
      ) : null}
    </article>
  )
}
