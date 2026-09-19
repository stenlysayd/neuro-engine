export type KeyStatus = 'active' | 'exhausted' | 'error' | 'disabled';

export type PublicApiKey = {
  id: string;
  provider: string;
  tier: string | null;
  status: KeyStatus;
  quota_limit: number | null;
  quota_used: number;
  quota_reset_at: string | null;
  priority: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at?: string;
  maskedKey: string;
  usagePercent: number | null;
  remainingQuota: number | null;
  rest_until?: string | null;
  exhausted_reason?: string | null;
  is_locked?: boolean;
};

export type UsageLog = {
  id: number;
  keyId: string | null;
  provider: string | null;
  model: string | null;
  requestType: string;
  tokensOrChars: number;
  success: 0 | 1 | boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  requestId: string;
  createdAt: string;
  metadata?: string | null;
  keyTier?: string | null;
};

export type BrainRoute = {
  provider: string;
  model: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number;
};

export type BrainConfig = {
  activeProvider: string;
  activeModel: string;
  autoFailover: boolean;
  temperature: number;
  maxTokens: number;
  cascade: BrainRoute[];
  systemPrompt?: string;
};

export type TTSConfig = {
  defaultVoiceId: string;
  modelId: string;
  cacheEnabled: boolean;
  tierPreference: (string | null)[];
  distributedEnabled?: boolean;
  maxConcurrency?: number;
  minChunkChars?: number;
};

export type OpsConfig = {
  clusterId: string;
  environment: string;
  healthcheckIntervalMs: number;
  requestTimeoutMs: number;
  autoRecoveryIntervalMs: number;
};

export type Telemetry = {
  now: string;
  uptimeSeconds: number;
  keys: {
    total: number;
    active: number;
    exhausted: number;
    error: number;
    disabled: number;
    byProvider: Record<string, { active: number; exhausted: number; error: number; disabled: number; total: number }>;
  };
  usage: {
    windowMinutes: number;
    requests: number;
    volume: number;
    successes: number;
    successRate: number;
    throughput: number;
    avgLatency: number;
    byProvider: Array<Record<string, unknown>>;
  };
  healthPercent: number;
  activeBrain: {
    provider: string;
    model: string;
    autoFailover: boolean;
  };
};

export type DashboardSnapshot = {
  telemetry: Telemetry;
  keys: PublicApiKey[];
  usageLogs: UsageLog[];
  usageSummary: Telemetry['usage'];
  brainConfig: BrainConfig;
  ttsConfig: TTSConfig;
  opsConfig: OpsConfig;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.error || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function wsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  groq: 'Groq Cloud',
  elevenlabs: 'ElevenLabs',
  local: 'Local vLLM/Ollama'
};

export const providerIcons: Record<string, string> = {
  openai: 'hub',
  anthropic: 'psychology',
  google: 'auto_awesome',
  groq: 'bolt',
  elevenlabs: 'record_voice_over',
  local: 'dns'
};

export function labelForProvider(provider: string): string {
  return providerLabels[provider] || provider;
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(Number(value ?? 0));
}

export function formatTimeAgo(value?: string | null): string {
  if (!value) return 'never';
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 0) return 'now';
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function toCsv(logs: UsageLog[]): string {
  const headers = ['id', 'createdAt', 'provider', 'model', 'requestType', 'tokensOrChars', 'success', 'statusCode', 'latencyMs', 'requestId', 'error'];
  const rows = logs.map(log => headers.map(header => JSON.stringify(String(log[header as keyof UsageLog] ?? ''))).join(','));
  return [headers.join(','), ...rows].join('\n');
}
