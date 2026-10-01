import { z } from 'zod';
import { ModelTierSchema } from './models';

export const ProviderConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
  display_name: z.string(),
  base_url: z.string().optional(),
  api_key_ref: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  max_concurrency: z.number().int().positive().optional(),
  rate_limit_rpm: z.number().int().positive().optional(),
  data_use_policy: z.enum(['no_training', 'trains_on_prompts', 'unknown']).optional().default('unknown'),
  created_at: z.number().int().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const AgentDefinitionSchema = z.object({
  name: z.string(),
  system_prompt: z.string(),
  allowed_tools: z.array(z.string()),
  preferred_model_ref: z.string().default('flappyauto'),
  fallback_policy: z.enum(['ask_user', 'next_best_fit', 'abort']).default('ask_user'),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const PermissionRuleSchema = z.object({
  action: z.enum(['allow', 'ask', 'deny']),
  pattern: z.string(),
  project_scoped: z.boolean().default(true),
});
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

export const PermissionConfigSchema = z.object({
  shell_allow: z.array(z.string()).default([
    'git status*',
    'git diff*',
    'git log*',
    'npm test*',
    'pnpm test*',
    'yarn test*',
    'node --version*',
    'pnpm --version*',
    'npm --version*'
  ]),
  shell_deny: z.array(z.string()).default([
    'rm -rf /',
    'rmdir /s /q c:\\',
    'git push --force*',
    'git reset --hard*',
    'mkfs*'
  ]),
  shell_ask: z.array(z.string()).default(['*']),
});
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;

export const SandboxConfigSchema = z.object({
  mode: z.enum(['host', 'docker']).default('host'),
  docker_image: z.string().optional(),
  timeout_ms: z.number().int().positive().default(60000),
  output_max_bytes: z.number().int().positive().default(200000),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export const FlappyConfigSchema = z.object({
  version: z.number().int().default(1),
  providers: z.array(ProviderConfigSchema).default([]),
  model_policy: z.object({
    default_tier: ModelTierSchema.default('free'),
    allow_paid_models: z.boolean().default(false),
    revalidate_every_hours: z.number().int().positive().default(6),
    privacy_mode: z.enum(['strict', 'standard']).default('standard'),
  }).default({
    default_tier: 'free',
    allow_paid_models: false,
    revalidate_every_hours: 6,
    privacy_mode: 'standard',
  }),
  agents: z.array(AgentDefinitionSchema).default([]),
  permissions: PermissionConfigSchema.default({
    shell_allow: [
      'git status*',
      'git diff*',
      'git log*',
      'npm test*',
      'pnpm test*',
      'yarn test*',
      'node --version*',
      'pnpm --version*',
      'npm --version*'
    ],
    shell_deny: [
      'rm -rf /',
      'rmdir /s /q c:\\',
      'git push --force*',
      'git reset --hard*',
      'mkfs*'
    ],
    shell_ask: ['*']
  }),
  sandbox: SandboxConfigSchema.default({
    mode: 'host',
    timeout_ms: 60000,
    output_max_bytes: 200000,
  }),
});
export type FlappyConfig = z.infer<typeof FlappyConfigSchema>;
