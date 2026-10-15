import { toHexColor } from '../permissions/permissions'

/** The strip at the top of a profile: the banner picture, else the profile colour. */
export const ProfileBanner = ({
  bannerUrl,
  accentColor,
  className = '',
}: {
  bannerUrl: string | null
  accentColor: number | null
  className?: string
}) => (
  <div
    data-testid="profile-banner"
    className={`aspect-[3/1] w-full overflow-hidden bg-elevated ${className}`}
    style={accentColor !== null ? { backgroundColor: toHexColor(accentColor) } : undefined}
  >
    {bannerUrl ? <img src={bannerUrl} alt="" className="size-full object-cover" /> : null}
  </div>
)
