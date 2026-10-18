import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** The header's search field; Enter searches, an emptied field closes the results. */
export const SearchBox = ({
  onSearch,
  className = '',
  open = false,
}: {
  onSearch: (input: string | null) => void
  className?: string
  /** Narrow screens: shown as a row under the header only while open. */
  open?: boolean
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // Opened from the header button on a narrow screen: typing goes straight in.
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  return (
    <form
      role="search"
      // Wide screens: a pill that gives way first when the header runs out of room.
      className={`${open ? 'absolute inset-x-3 top-full z-30 block' : 'hidden'} lg:relative lg:inset-auto lg:z-auto lg:block lg:min-w-10 lg:shrink-[4] lg:grow-0 lg:basis-40 ${className}`}
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(value.trim() || null)
      }}
    >
      <input
        type="search"
        aria-label={t('search.label')}
        placeholder={t('search.placeholder')}
        title={t('search.hint')}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          if (!event.target.value) onSearch(null)
        }}
        ref={input}
        className="h-[38px] w-full rounded-full bg-field pr-9 pl-4 text-[13px] font-normal outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
      />
      <Search
        aria-hidden
        className="pointer-events-none absolute top-[11px] right-3.5 size-4 text-faint"
      />
    </form>
  )
}
