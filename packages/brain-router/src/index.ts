import { BrainAdapter, BrainRoute, BrainRouterConfig, ChatInput, ChatOutput, EventBus } from '@neuro/core';
import { KeyPoolManager } from '@neuro/key-pool';
import { getBrainConfig, memoryManager, setBrainConfig } from '@neuro/memory';
import { OpenAIAdapter, AnthropicAdapter, GroqAdapter, LocalAdapter, GoogleAdapter } from './adapters';

export * from './adapters';
export * from './agentic';

export class BrainRouter {
  private adapters: Map<string, BrainAdapter> = new Map();
  private keyPool: KeyPoolManager;

  constructor(keyPool: KeyPoolManager) {
    this.keyPool = keyPool;
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new GroqAdapter());
    this.registerAdapter(new LocalAdapter());
    this.registerAdapter(new GoogleAdapter());
  }

  public registerAdapter(adapter: BrainAdapter) {
    this.adapters.set(adapter.provider, adapter);
  }

  public getConfig(): BrainRouterConfig {
    return getBrainConfig();
  }

  public updateConfig(patch: Partial<BrainRouterConfig>): BrainRouterConfig {
    const current = this.getConfig();
    const next: BrainRouterConfig = {
      ...current,
      ...patch,
      cascade: patch.cascade ?? current.cascade
    };
    setBrainConfig(next);
    EventBus.emit('brain:config', next);
    return next;
  }

  public async chat(input: ChatInput, provider?: string, tier?: string): Promise<ChatOutput> {
    const config = this.getConfig();
    const requestedProvider = provider || input.provider || config.activeProvider;
    const requestedModel = input.model || (requestedProvider === config.activeProvider ? config.activeModel : undefined);
    const routes = this.buildRoutes(config, requestedProvider, requestedModel);
    const userMessages = [...input.messages];
    const contextMessages = this.prepareMemoryContext(input, userMessages);
    let lastError: unknown = null;

    for (const route of routes) {
      const adapter = this.adapters.get(route.provider);
      if (!adapter) {
        lastError = new Error(`No adapter found for provider: ${route.provider}`);
        continue;
      }

      const attemptedKeys = new Set<string>();
      let attempt = 0;

      while (attempt < 25) {
        attempt += 1;
        const key = this.keyPool.acquire(route.provider, tier);
        if (!key || attemptedKeys.has(key.id)) {
          break;
        }
        attemptedKeys.add(key.id);

        const routedInput: ChatInput = {
          ...input,
          messages: contextMessages,
          model: route.model || requestedModel || input.model,
          temperature: input.temperature ?? config.temperature,
          maxTokens: input.maxTokens ?? config.maxTokens
        };

        const startTime = Date.now();
        try {
          const result = await adapter.chat(routedInput, key);
          const latency = Date.now() - startTime;
          const tokens = result.usage?.totalTokens || adapter.countTokens(routedInput);

          this.keyPool.logUsage(key.id, 'chat_completion', tokens, true, latency, {
            provider: route.provider,
            model: routedInput.model ?? null,
            statusCode: 200,
            metadata: { routePriority: route.priority, attempt }
          });

          if (input.conversationId) {
            memoryManager.addMessage(input.conversationId, 'assistant', result.content, route.provider);
          }

          const output = {
            ...result,
            provider: route.provider,
            model: routedInput.model,
            keyId: key.id
          };
          EventBus.emit('brain:response', output);
          return output;
        } catch (error: any) {
          const latency = Date.now() - startTime;
          const statusCode = Number(error.status || error.statusCode || 500);
          const errorMessage = error.message || String(error);
          lastError = error;

          if (statusCode === 429 || statusCode === 403) {
            this.keyPool.markExhausted(key.id, nextResetDate(error), errorMessage);
          } else if (statusCode === 401) {
            this.keyPool.markError(key.id, errorMessage);
          }

          this.keyPool.logUsage(key.id, 'chat_completion', 0, false, latency, {
            provider: route.provider,
            model: routedInput.model ?? null,
            statusCode,
            error: errorMessage,
            metadata: { routePriority: route.priority, attempt }
          });

          EventBus.emit('brain:error', { provider: route.provider, statusCode, error: errorMessage });

          if (!isRecoverable(statusCode)) {
            break;
          }
        }
      }

      if (!config.autoFailover && route.provider === requestedProvider) {
        break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No usable brain route available');
  }

  private prepareMemoryContext(input: ChatInput, userMessages: ChatInput['messages']) {
    const config = this.getConfig();
    const systemPrompt = config.systemPrompt;

    let baseMessages = userMessages;
    if (input.conversationId) {
      memoryManager.createConversation(input.conversationId);
      const history = memoryManager.getMessages(input.conversationId);

      for (const msg of userMessages) {
        memoryManager.addMessage(input.conversationId, msg.role, msg.content);
      }

      baseMessages = [...history, ...userMessages];
    }

    if (systemPrompt && !baseMessages.some(m => m.role === 'system')) {
      return [{ role: 'system' as const, content: systemPrompt }, ...baseMessages];
    }

    return baseMessages;
  }

  private buildRoutes(config: BrainRouterConfig, provider: string, model?: string): BrainRoute[] {
    const configuredRoutes = [...config.cascade]
      .filter(route => route.enabled)
      .sort((a, b) => b.priority - a.priority);

    const primaryRoute = configuredRoutes.find(route => route.provider === provider);
    const head: BrainRoute = primaryRoute
      ? { ...primaryRoute, model: model || primaryRoute.model }
      : { provider, model: model || config.activeModel, enabled: true, priority: 999, weight: 100, timeoutMs: 30000 };

    if (!config.autoFailover) {
      return [head];
    }

    return [
      head,
      ...configuredRoutes.filter(route => route.provider !== provider)
    ];
  }
}

function isRecoverable(statusCode: number) {
  return statusCode === 401 || statusCode === 403 || statusCode === 408 || statusCode === 409 ||
    statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function nextResetDate(error: any) {
  const headerValue = error?.resetAt || error?.headers?.['retry-after'];
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) {
      return new Date(Date.now() + seconds * 1000);
    }

    const parsed = new Date(headerValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(Date.now() + 60 * 60 * 1000);
}
