import type { ThemeChoice } from '../../lib/theme'

/** A miniature window — rail, two panels, a chat with one message each way. */
const Miniature = ({ theme, className = '' }: { theme: 'dark' | 'light'; className?: string }) => (
  <div
    data-preview={theme}
    className={`grid h-24 grid-cols-[18px_44px_1fr] gap-[5px] bg-(--preview-rail) p-1.5 ${className}`}
  >
    <div className="rounded-[7px] bg-(--preview-side)" />
    <div className="rounded-[7px] bg-(--preview-side)" />
    <div className="flex flex-col justify-end gap-[5px] rounded-[7px] bg-(--preview-main) p-2">
      <div className="h-2.5 w-3/5 rounded-[5px] bg-(--preview-field)" />
      <div className="h-2.5 w-[45%] self-end rounded-[5px] bg-(--preview-accent)" />
    </div>
  </div>
)

/** "As in the system" shows one window cut down the middle: dark on the left, light on the right. */
export const ThemePreview = ({ theme }: { theme: ThemeChoice }) => (
  <div aria-hidden className="relative overflow-hidden rounded-field">
    {theme === 'system' ? (
      <>
        <Miniature theme="dark" />
        <Miniature theme="light" className="absolute inset-0 [clip-path:inset(0_0_0_50%)]" />
      </>
    ) : (
      <Miniature theme={theme} />
    )}
  </div>
)
