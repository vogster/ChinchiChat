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
      className={`${open ? 'absolute inset-x-2 top-full z-30 mt-1 block' : 'hidden'} lg:relative lg:inset-auto lg:z-auto lg:mt-0 lg:block ${className}`}
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
        className="w-full rounded bg-rail lg:w-48 lg:focus:w-64 py-1 pr-7 pl-2 text-sm font-normal outline-none placeholder:text-muted focus:outline-2 focus:outline-accent"
      />
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1.5 right-2 size-4 text-muted"
      />
    </form>
  )
}
