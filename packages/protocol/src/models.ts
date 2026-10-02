import { z } from 'zod';

export const ModelTierSchema = z.enum([
  'free',
  'rate_limited_free',
  'paid',
  'disabled',
  'unavailable',
]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const TierSourceSchema = z.enum([
  'override',
  'community',
  'metadata',
  'rule',
]);
export type TierSource = z.infer<typeof TierSourceSchema>;

export const DataUsePolicySchema = z.enum([
  'no_training',
  'trains_on_prompts',
  'unknown',
]);
export type DataUsePolicy = z.infer<typeof DataUsePolicySchema>;

export const RawModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().int().nonnegative().default(4096),
  supports_tools: z.boolean().default(false),
  supports_vision: z.boolean().default(false),
  price_in: z.number().nonnegative().default(0),
  price_out: z.number().nonnegative().default(0),
  raw_metadata: z.record(z.any()).optional(),
});
export type RawModel = z.infer<typeof RawModelSchema>;

export const ModelSchema = z.object({
  provider_id: z.string(),
  model_id: z.string(),
  tier: ModelTierSchema,
  tier_source: TierSourceSchema,
  context_length: z.number().int().nonnegative(),
  modality: z.string().default('text->text'),
  supports_tools: z.boolean(),
  supports_vision: z.boolean(),
  tool_probe_passed: z.boolean().nullable().default(null),
  price_in: z.number().nonnegative().default(0),
  price_out: z.number().nonnegative().default(0),
  avg_latency_ms: z.number().int().nonnegative().default(0),
  last_validated_at: z.number().int().nonnegative(),
  data_use_policy: DataUsePolicySchema.default('unknown'),
  is_local: z.boolean().default(false),
  is_pinned: z.boolean().default(false),
});
export type Model = z.infer<typeof ModelSchema>;

export const ModelOverrideSchema = z.object({
  provider_id: z.string(),
  model_id: z.string(),
  tier: ModelTierSchema,
  created_at: z.number().int().nonnegative(),
});
export type ModelOverride = z.infer<typeof ModelOverrideSchema>;

export const PaidGrantSchema = z.object({
  id: z.string(),
  model_id: z.string(),
  provider_id: z.string(),
  granted_at: z.number().int(),
  reason: z.enum(['user_pinned', 'pool_exhaustion_authorized']),
});
export type PaidGrant = z.infer<typeof PaidGrantSchema>;

export const TaskRequirementsSchema = z.object({
  taskType: z.enum(['planning', 'coding', 'review', 'test', 'command', 'search', 'general']),
  role: z.string().optional(),
  minContext: z.number().int().nonnegative().optional(),
  tools: z.boolean().optional(),
  vision: z.boolean().optional(),
  preferredProvider: z.string().optional(),
  excludeModelIds: z.array(z.string()).optional(),
});
export type TaskRequirements = z.infer<typeof TaskRequirementsSchema>;

export const CommunityModelEntrySchema = z.object({
  tier: ModelTierSchema,
  context_length: z.number().int().nonnegative().optional(),
  supports_tools: z.boolean().default(false),
  supports_vision: z.boolean().default(false),
  data_use_policy: DataUsePolicySchema.optional(),
  note: z.string().optional(),
});
export type CommunityModelEntry = z.infer<typeof CommunityModelEntrySchema>;

export const CommunityCatalogSchema = z.object({
  version: z.string(),
  updated_at: z.string().optional(),
  models: z.record(CommunityModelEntrySchema),
});
export type CommunityCatalog = z.infer<typeof CommunityCatalogSchema>;

