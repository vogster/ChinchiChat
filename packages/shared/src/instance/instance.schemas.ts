import { z } from 'zod'

export const registrationModeSchema = z.enum(['open', 'invite', 'closed'])

/** File upload limits; null in instance info when the instance has no object storage. */
export const uploadLimitsSchema = z.object({
  maxBytes: z.number().int().positive(),
  maxAttachments: z.number().int().positive(),
})

/** Public facts about this Chinchi instance, readable without signing in. */
export const instanceInfoSchema = z.object({
  name: z.string(),
  registrationMode: registrationModeSchema,
  uploads: uploadLimitsSchema.nullable(),
  /** Whether voice and video (LiveKit) are set up. */
  voice: z.boolean(),
})

export type RegistrationMode = z.infer<typeof registrationModeSchema>
export type UploadLimits = z.infer<typeof uploadLimitsSchema>
export type InstanceInfo = z.infer<typeof instanceInfoSchema>
