import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BIO_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@chinchi/shared'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from '../auth/queries'
import { Avatar } from '../../components/ui/avatar'
import { ImageUploadControl } from '../media/image-upload-control'
import { toHexColor } from '../permissions/permissions'
import { ProfileBanner } from '../profile/profile-banner'

import type { CurrentUser } from '@chinchi/shared'

const formSchema = z.object({
  displayName: z.string().trim().max(DISPLAY_NAME_MAX_LENGTH),
  bio: z.string().trim().max(BIO_MAX_LENGTH),
  // '#rrggbb' from the colour input, or '' for no colour.
  accentColor: z.string(),
})
type FormValues = z.infer<typeof formSchema>

/** What the colour input shows before a colour is picked (the theme accent). */
const DEFAULT_ACCENT = '#5865f2'

const toValues = (user: CurrentUser): FormValues => ({
  displayName: user.displayName ?? '',
  bio: user.bio ?? '',
  accentColor: user.accentColor === null ? '' : toHexColor(user.accentColor),
})

const fromHex = (hex: string): number | null =>
  hex === '' ? null : Number.parseInt(hex.slice(1), 16)

export const ProfileForm = ({ user }: { user: CurrentUser }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toValues(user),
  })

  const save = useMutation({
    // An empty field clears the display name, so the username is shown instead.
    // Only what changed: an emptied field clears it (the username or no bio is shown instead).
    mutationFn: ({ displayName, bio, accentColor }: FormValues) =>
      api.users.updateMe({
        ...(displayName !== (user.displayName ?? '')
          ? { displayName: displayName === '' ? null : displayName }
          : {}),
        ...(bio !== (user.bio ?? '') ? { bio: bio === '' ? null : bio } : {}),
        ...(fromHex(accentColor) !== user.accentColor ? { accentColor: fromHex(accentColor) } : {}),
      }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(authKeys.me, updated)
      reset(toValues(updated))
    },
  })

  // null removes the avatar.
  const avatar = useMutation({
    mutationFn: (file: File | null) => (file ? api.users.setAvatar(file) : api.users.clearAvatar()),
    onSuccess: ({ user: updated }) => queryClient.setQueryData(authKeys.me, updated),
  })

  const banner = useMutation({
    mutationFn: (file: File | null) => (file ? api.users.setBanner(file) : api.users.clearBanner()),
    onSuccess: ({ user: updated }) => queryClient.setQueryData(authKeys.me, updated),
  })

  // useWatch (not watch) keeps the component compatible with the React Compiler.
  const typed = useWatch({ control, name: 'displayName' })
  const preview = typed.trim() || user.username
  const bioText = useWatch({ control, name: 'bio' })
  const accent = useWatch({ control, name: 'accentColor' })

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
      <ImageUploadControl
        uploadLabel={t('settings.profile.uploadAvatar')}
        removeLabel={t('settings.profile.removeAvatar')}
        hasImage={user.avatarUrl !== null}
        pending={avatar.isPending}
        error={avatar.error}
        onSelect={(file) => avatar.mutate(file)}
        onRemove={() => avatar.mutate(null)}
      />
      <ImageUploadControl
        uploadLabel={t('settings.profile.uploadBanner')}
        removeLabel={t('settings.profile.removeBanner')}
        hasImage={user.bannerUrl !== null}
        pending={banner.isPending}
        error={banner.error}
        onSelect={(file) => banner.mutate(file)}
        onRemove={() => banner.mutate(null)}
      />

      {save.isError ? <Alert tone="error">{errorMessage(t, save.error)}</Alert> : null}
      {save.isSuccess && !isDirty ? <Alert tone="success">{t('settings.saved')}</Alert> : null}

      <div className="flex flex-col gap-1.5">
        <TextField
          label={t('settings.profile.displayName')}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder={user.username}
          error={errors.displayName ? t('validation.displayName') : undefined}
          {...register('displayName')}
        />
        <p className="text-xs text-muted">{t('settings.profile.displayNameHint')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Same look as TextField's label and input, for a multi-line field. */}
        <label
          htmlFor="profile-bio"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('settings.profile.bio')}
        </label>
        <textarea
          id="profile-bio"
          rows={3}
          maxLength={BIO_MAX_LENGTH}
          className="resize-none rounded-md border border-border bg-rail px-3 py-2 text-text outline-none transition focus:border-accent"
          {...register('bio')}
        />
        <div className="flex justify-between text-xs text-muted">
          <span>{t('settings.profile.bioHint')}</span>
          <span
            aria-label={t('settings.profile.bioLeft', { count: BIO_MAX_LENGTH - bioText.length })}
          >
            {BIO_MAX_LENGTH - bioText.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-accent"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('settings.profile.accentColor')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="profile-accent"
            type="color"
            className="h-9 w-14 cursor-pointer rounded-md border border-border bg-rail"
            value={accent || DEFAULT_ACCENT}
            onChange={(event) =>
              setValue('accentColor', event.currentTarget.value, { shouldDirty: true })
            }
          />
          {accent ? (
            <Button
              variant="secondary"
              fullWidth={false}
              onClick={() => setValue('accentColor', '', { shouldDirty: true })}
            >
              {t('settings.profile.resetColor')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">{t('settings.profile.accentColorHint')}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          {t('settings.profile.preview')}
        </p>
        <div className="max-w-sm overflow-hidden rounded-lg bg-rail">
          <ProfileBanner bannerUrl={user.bannerUrl} accentColor={fromHex(accent)} />
          <div className="flex items-center gap-3 p-3" data-testid="profile-preview">
            <Avatar name={preview} src={user.avatarUrl} id={user.id} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{preview}</div>
              <div className="truncate text-xs text-muted">{user.username}</div>
            </div>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        pending={save.isPending}
        disabled={!isDirty}
        className="sm:w-auto sm:self-start"
      >
        {t('settings.profile.save')}
      </Button>
    </form>
  )
}
