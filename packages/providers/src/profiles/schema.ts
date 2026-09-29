import { z } from 'zod';

export const DataUseTrainingPolicySchema = z.enum(['yes', 'no', 'opt_out', 'unknown']);
export type DataUseTrainingPolicy = z.infer<typeof DataUseTrainingPolicySchema>;

export const RateLimitSpecSchema = z.object({
  requestsPerMinute: z.number().int().positive().optional(),
  tokensPerMinute: z.number().int().positive().optional(),
  requestsPerDay: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
export type RateLimitSpec = z.infer<typeof RateLimitSpecSchema>;

export const ProviderProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['openai_compatible', 'anthropic', 'google', 'mock']),
  baseUrl: z.string().min(1),
  authScheme: z.enum(['bearer', 'x-api-key', 'none']),
  envKeyName: z.string().min(1),
  discovery: z.object({
    endpoint: z.string().min(1),
    supported: z.boolean(),
  }),
  supportsToolCalls: z.boolean(),
  supportsStreaming: z.boolean(),
  dataUsePolicy: z.object({
    trainsOnData: DataUseTrainingPolicySchema,
    sourceUrl: z.string().url().optional(),
    verifiedAt: z.string().optional(),
    details: z.string().optional(),
  }),
  rateLimits: z.object({
    freeTier: RateLimitSpecSchema.optional(),
    paidTier: RateLimitSpecSchema.optional(),
  }),
  documentationUrl: z.string().url(),
  verifiedAt: z.string().min(1),
  needsHumanVerification: z.boolean().default(false),
  notes: z.string().optional(),
});

export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;
