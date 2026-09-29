import { z } from 'zod';

/**
 * Model tiers per SRS §6.1 and SystemArchitecture §6.2.
 */
export const TierSchema = z.enum([
  'free',
  'rate_limited_free',
  'paid',
  'disabled',
  'unavailable',
]);
export type Tier = z.infer<typeof TierSchema>;

/**
 * Free tiers that can be chosen without a PaidGrant.
 */
export const FREE_TIERS: ReadonlySet<Tier> = new Set(['free', 'rate_limited_free']);

/**
 * Model pricing per 1M tokens.
 */
export const ModelPricingSchema = z.object({
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

/**
 * Normalized model specification.
 */
export const ModelSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().optional(),
  tier: TierSchema,
  tierSource: z.enum(['override', 'community', 'metadata', 'rule', 'default']).optional(),
  contextLength: z.number().int().positive().default(4096),
  modality: z.string().default('text->text'),
  supportsTools: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  toolProbePassed: z.boolean().optional(),
  pricing: ModelPricingSchema.optional(),
  avgLatencyMs: z.number().int().nonnegative().optional(),
  lastValidatedAt: z.number().int().nonnegative().optional(),
});
export type Model = z.infer<typeof ModelSchema>;

/**
 * Provider configuration schema.
 */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1), // e.g. 'openai-compatible', 'anthropic', 'google', 'ollama'
  displayName: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKeyRef: z.string().optional(), // e.g. 'env:NAME' or 'keychain:<ref>'
  enabled: z.boolean().default(true),
  maxConcurrency: z.number().int().positive().default(4),
  dataUsePolicy: z.enum(['yes', 'no', 'unknown']).default('unknown'),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Agent definition schema matching Spec §4.17 and D1.
 */
export const FallbackPolicySchema = z.enum(['ask_user', 'next_free', 'abort']);
export type FallbackPolicy = z.infer<typeof FallbackPolicySchema>;

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  allowedTools: z.array(z.string()),
  model: z.string().min(1), // pinned model ID, or 'flappyauto', 'auto:free-fast', 'auto:best-fit-free'
  fallbackPolicy: FallbackPolicySchema.default('ask_user'),
  systemPrompt: z.string().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

/**
 * Task graph node schema.
 */
export const TaskNodeStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type TaskNodeStatus = z.infer<typeof TaskNodeStatusSchema>;

export const TaskNodeSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  status: TaskNodeStatusSchema.default('pending'),
  modelUsed: z.string().optional(),
  substitutions: z.array(z.string()).optional(),
  startedAt: z.number().int().positive().optional(),
  endedAt: z.number().int().positive().optional(),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

/**
 * Directed acyclic graph representing a broken-down plan.
 */
export const TaskGraphSchema = z.object({
  goal: z.string().optional(),
  nodes: z.array(TaskNodeSchema).min(1),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

/**
 * Model routing policy configuration.
 */
export const ModelPolicySchema = z.object({
  preferFree: z.boolean().default(true),
  notifyOnPoolExhaustion: z.boolean().default(true),
  revalidateEveryHours: z.number().positive().default(6),
});
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;

/**
 * Permissions policy configuration.
 */
export const PermissionsConfigSchema = z.object({
  allow: z.array(z.string()).default([]),
  ask: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

/**
 * Sandbox configuration.
 */
export const SandboxConfigSchema = z.object({
  mode: z.enum(['host', 'docker']).default('host'),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

/**
 * Full application configuration schema matching SRS §6.2.
 */
export const ConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  providers: z.array(ProviderConfigSchema).default([]),
  modelPolicy: ModelPolicySchema.default({
    preferFree: true,
    notifyOnPoolExhaustion: true,
    revalidateEveryHours: 6,
  }),
  agents: z.record(z.string(), z.string()).default({}),
  permissions: PermissionsConfigSchema.default({
    allow: [],
    ask: [],
    deny: [],
  }),
  sandbox: SandboxConfigSchema.default({
    mode: 'host',
  }),
});
export type Config = z.infer<typeof ConfigSchema>;
