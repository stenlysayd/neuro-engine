import { EventEmitter } from 'events';

export const EventBus = new EventEmitter();
EventBus.setMaxListeners(50);

export type ApiKeyStatus = 'active' | 'exhausted' | 'error' | 'disabled';
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ApiKey {
  id: string;
  provider: string;
  tier?: string | null;
  key_encrypted: string;
  secret?: string;
  status: ApiKeyStatus;
  quota_limit?: number | null;
  quota_used: number;
  quota_reset_at?: string | null;
  priority: number;
  last_used_at?: string | null;
  last_error?: string | null;
  rest_until?: string | null;
  exhausted_reason?: string | null;
  created_at?: string;
}

export interface PublicApiKey extends Omit<ApiKey, 'key_encrypted' | 'secret'> {
  maskedKey: string;
  usagePercent: number | null;
  remainingQuota: number | null;
  is_locked?: boolean;
}

export * from './encryption';

export interface ChatInput {
  conversationId?: string;
  messages: { role: ChatRole, content: string }[];
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatOutput {
  content: string;
  provider?: string;
  model?: string;
  keyId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface BrainAdapter {
  provider: string;
  chat(input: ChatInput, key: ApiKey): Promise<ChatOutput>;
  streamChat?(input: ChatInput, key: ApiKey): AsyncIterable<{ content: string }>;
  countTokens(input: ChatInput): number;
}

export interface BrainRoute {
  provider: string;
  model: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number;
}

export interface BrainRouterConfig {
  activeProvider: string;
  activeModel: string;
  autoFailover: boolean;
  temperature: number;
  maxTokens: number;
  cascade: BrainRoute[];
  systemPrompt?: string;
}

export interface TTSConfig {
  defaultVoiceId: string;
  modelId: string;
  cacheEnabled: boolean;
  tierPreference: (string | null)[];
  distributedEnabled?: boolean;
  maxConcurrency?: number;
  minChunkChars?: number;
}

export interface OpsConfig {
  clusterId: string;
  environment: string;
  healthcheckIntervalMs: number;
  requestTimeoutMs: number;
  autoRecoveryIntervalMs: number;
}
