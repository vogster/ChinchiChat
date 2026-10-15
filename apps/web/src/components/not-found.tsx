import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const NotFound = () => {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-main p-8 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-muted">{t('notFound.text')}</p>
      <Link
        to="/"
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-contrast hover:opacity-90"
      >
        {t('notFound.home')}
      </Link>
    </div>
  )
}
