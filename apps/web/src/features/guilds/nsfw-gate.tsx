import { useNavigate } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'

/** Stands in for an age-restricted channel until the viewer says they may see it. */
export const NsfwGate = ({ onAccept }: { onAccept: () => void }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <section
      aria-labelledby="nsfw-gate-title"
      className="flex flex-1 items-center justify-center p-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <ShieldAlert aria-hidden className="size-12 text-muted" />
        <h2 id="nsfw-gate-title" className="text-lg font-semibold">
          {t('nsfw.title')}
        </h2>
        <p className="text-sm text-muted">{t('nsfw.text')}</p>
        <div className="flex w-full gap-2">
          <Button variant="secondary" onClick={() => void navigate({ to: '/' })}>
            {t('nsfw.leave')}
          </Button>
          <Button onClick={onAccept}>{t('nsfw.continue')}</Button>
        </div>
      </div>
    </section>
  )
}
