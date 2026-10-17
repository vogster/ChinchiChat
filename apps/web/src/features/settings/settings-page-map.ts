import { BotsSection } from '../bots/bots-section'
import {
  AccountPage,
  AppearancePage,
  AppPage,
  LanguagePage,
  NotificationsPage,
  PrivacyPage,
  ProfilePage,
  SessionsPage,
  VoicePage,
} from './settings-pages'

import type { SettingsSectionKey } from './settings-search'
import type { ComponentType } from 'react'

/** What each section of the user settings shows. */
export const SETTINGS_PAGES: Record<SettingsSectionKey, ComponentType> = {
  account: AccountPage,
  profile: ProfilePage,
  privacy: PrivacyPage,
  notifications: NotificationsPage,
  voice: VoicePage,
  sessions: SessionsPage,
  bots: BotsSection,
  appearance: AppearancePage,
  language: LanguagePage,
  app: AppPage,
}
