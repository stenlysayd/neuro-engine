import cors from 'cors';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { BrainRouter } from '@neuro/brain-router';
import { keyPool } from '@neuro/key-pool';
import { TTSRouter } from '@neuro/tts-router';
import { EventBus, OpsConfig, TTSConfig, maskSecret, PublicApiKey } from '@neuro/core';
import {
  db,
  getOpsConfig,
  getTTSConfig,
  initDatabase,
  memoryManager,
  setBrainConfig,
  setOpsConfig,
  setTTSConfig
} from '@neuro/memory';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '2mb' }));

initDatabase();
const brainRouter = new BrainRouter(keyPool);
const ttsRouter = new TTSRouter(keyPool);

const asyncHandler = (handler: express.RequestHandler): express.RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    now: new Date().toISOString()
  });
});

app.get('/api/dashboard', (_req, res) => {
  res.json(getDashboardSnapshot());
});

app.get('/api/telemetry', (_req, res) => {
  res.json(getTelemetry());
});

app.get('/api/keys', (req, res) => {
  res.json({ keys: keyPool.listKeys(req.query.provider?.toString()) });
});

app.post('/api/keys', (req, res) => {
  const key = keyPool.addKey({
    provider: req.body.provider,
    key: req.body.key,
    tier: req.body.tier ?? null,
    status: req.body.status,
    quotaLimit: numericOrNull(req.body.quotaLimit),
    quotaUsed: Number(req.body.quotaUsed ?? 0),
    priority: Number(req.body.priority ?? 0)
  });
  res.status(201).json({ key });
});

app.post(['/api/keys/import', '/api/keys/batch'], (req, res) => {
  let items = Array.isArray(req.body) ? req.body : req.body.keys;

  if (!items && typeof req.body.rawText === 'string') {
    const defaultProvider = req.body.provider || 'anthropic';
    const defaultTier = req.body.tier || null;
    const defaultPriority = Number(req.body.priority ?? 10);
    const descendingPriority = Boolean(req.body.descendingPriority);
    const quotaLimit = numericOrNull(req.body.quotaLimit);
    const status = req.body.status || 'active';

    const lines = req.body.rawText
      .split(/\r?\n|,|;/)
      .map((l: string) => l.trim().replace(/^[\d+.\-*\s]+/, '').trim())
      .filter((l: string) => l.length > 0 && !l.startsWith('#'));

    items = lines.map((keyStr: string, idx: number) => ({
      provider: defaultProvider,
      key: keyStr,
      tier: defaultTier,
      priority: descendingPriority ? Math.max(1, defaultPriority - idx) : defaultPriority,
      quotaLimit,
      status
    }));
  }

  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'Expected an array of keys or { keys: [...] } or { rawText: "..." }' });
    return;
  }

  const imported: PublicApiKey[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const item of items) {
    try {
      if (!item.key || typeof item.key !== 'string' || !item.key.trim()) {
        continue;
      }
      const created = keyPool.addKey({
        provider: item.provider,
        key: item.key.trim(),
        tier: item.tier ?? null,
        status: item.status,
        quotaLimit: numericOrNull(item.quotaLimit ?? item.quota_limit),
        quotaUsed: numericOrNull(item.quotaUsed ?? item.quota_used) ?? 0,
        priority: Number(item.priority ?? 0)
      });
      if (item.resetAt || item.exhausted_reason) {
        keyPool.updateKey(created.id, {
          resetAt: item.resetAt,
          status: item.status || (item.exhausted_reason ? 'exhausted' : undefined)
        });
      }
      imported.push(created);
    } catch (err: any) {
      failed.push({
        key: maskSecret(item.key || ''),
        error: err.message || 'Failed to add key'
      });
    }
  }

  res.status(201).json({
    success: true,
    count: imported.length,
    imported,
    failed
  });
});

app.post('/api/keys/sync-quotas', asyncHandler(async (req, res) => {
  const providerFilter = (req.query.provider?.toString() || req.body?.provider || '').toLowerCase();
  let targetKeys = keyPool.listKeys();
  if (providerFilter && providerFilter !== 'all') {
    targetKeys = targetKeys.filter(k => k.provider === providerFilter);
  }

  const results: Array<{ id: string; maskedKey: string; ok: boolean; remaining?: number | null; quota_limit?: number | null; quota_used?: number | null; detail?: string }> = [];
  let synced = 0;
  let exhausted = 0;
  let errors = 0;

  // Process in concurrent batches of 5
  const concurrency = 5;
  for (let i = 0; i < targetKeys.length; i += concurrency) {
    const chunk = targetKeys.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (k) => {
        try {
          const valResult = await validateKey(k.id);
          if (valResult.ok) {
            synced++;
            if (valResult.is_exhausted) exhausted++;
          } else {
            errors++;
          }
          results.push({
            id: k.id,
            maskedKey: k.maskedKey,
            ok: valResult.ok,
            remaining: valResult.remaining_quota,
            quota_limit: valResult.quota_limit,
            quota_used: valResult.quota_used,
            detail: valResult.detail
          });
        } catch (err: any) {
          errors++;
          results.push({
            id: k.id,
            maskedKey: k.maskedKey,
            ok: false,
            detail: err.message || 'Sync failed'
          });
        }
      })
    );
  }

  res.json({
    success: true,
    total: targetKeys.length,
    synced,
    exhausted,
    errors,
    results,
    keys: keyPool.listKeys()
  });
}));

app.post(['/api/keys/validate', '/api/keys/test'], asyncHandler(async (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key) {
    res.status(400).json({
      ok: false,
      success: false,
      status: 400,
      detail: 'Provider and key are required',
      error: 'Provider and key are required'
    });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpsConfig().requestTimeoutMs || 15000);

  try {
    const result = await runValidationRequest(provider, key, controller.signal);
    const latencyMs = Date.now() - startedAt;
    res.json({ ...result, latencyMs });
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err.name === 'AbortError';
    res.status(200).json({
      ok: false,
      success: false,
      status: isTimeout ? 408 : 500,
      detail: isTimeout ? 'Validation request timed out' : (err.message || 'Validation request failed'),
      error: isTimeout ? 'Validation request timed out' : (err.message || 'Validation request failed'),
      latencyMs
    });
  } finally {
    clearTimeout(timeout);
  }
}));

app.patch('/api/keys/:id', (req, res) => {
  const key = keyPool.updateKey(req.params.id, {
    provider: req.body.provider,
    tier: req.body.tier,
    status: req.body.status,
    quotaLimit: req.body.quotaLimit === undefined ? undefined : numericOrNull(req.body.quotaLimit),
    quotaUsed: req.body.quotaUsed === undefined ? undefined : Number(req.body.quotaUsed),
    priority: req.body.priority === undefined ? undefined : Number(req.body.priority),
    resetAt: req.body.resetAt
  });
  res.json({ key });
});

app.post('/api/keys/:id/rotate', (req, res) => {
  const key = keyPool.rotateKey(req.params.id, req.body.key, req.body.resetQuota !== false);
  res.json({ key });
});

app.post('/api/keys/:id/status', (req, res) => {
  const key = keyPool.setStatus(req.params.id, req.body.status, req.body.error ?? null);
  res.json({ key });
});

app.post('/api/keys/:id/reset-quota', (req, res) => {
  res.json({ key: keyPool.resetQuota(req.params.id) });
});

app.post(['/api/keys/:id/test', '/api/keys/:id/validate'], asyncHandler(async (req, res) => {
  const result = await validateKey(req.params.id);
  res.json(result);
}));

app.delete('/api/keys/:id', (req, res) => {
  keyPool.deleteKey(req.params.id);
  res.status(204).send();
});

app.get('/api/usage', (req, res) => {
  res.json({
    logs: keyPool.listUsageLogs(
      Number(req.query.limit ?? 100),
      req.query.provider?.toString(),
      req.query.type?.toString(),
      req.query.success === undefined ? undefined : req.query.success === 'true'
    )
  });
});

app.get('/api/usage/summary', (req, res) => {
  res.json(keyPool.getUsageSummary(Number(req.query.minutes ?? 15)));
});

app.get('/api/brain', (_req, res) => {
  res.json(brainRouter.getConfig());
});

app.put('/api/brain', (req, res) => {
  const current = brainRouter.getConfig();
  const next = {
    ...current,
    ...req.body,
    cascade: Array.isArray(req.body.cascade) ? req.body.cascade : current.cascade
  };
  res.json(setBrainConfig(next));
  EventBus.emit('brain:config', next);
});

app.post('/api/chat', asyncHandler(async (req, res) => {
  const message = req.body.message?.toString();
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const response = await brainRouter.chat({
    conversationId: req.body.conversationId,
    messages: [{ role: 'user', content: message }],
    provider: req.body.provider,
    model: req.body.model,
    temperature: req.body.temperature,
    maxTokens: req.body.maxTokens
  }, req.body.provider, req.body.tier);

  res.json(response);
}));

app.post('/api/brain/test', asyncHandler(async (req, res) => {
  const response = await brainRouter.chat({
    messages: [{ role: 'user', content: req.body.message || 'Reply with OK if this route is healthy.' }],
    provider: req.body.provider,
    model: req.body.model,
    maxTokens: 32,
    temperature: 0
  }, req.body.provider, req.body.tier);

  res.json(response);
}));

app.get('/api/tts/config', (_req, res) => {
  res.json(getTTSConfig());
});

app.put('/api/tts/config', (req, res) => {
  const current = getTTSConfig();
  const next: TTSConfig = { ...current, ...req.body };
  res.json(setTTSConfig(next));
  EventBus.emit('tts:config', next);
});

app.post('/api/tts', asyncHandler(async (req, res) => {
  const text = req.body.text?.toString();
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const audioBuffer = await ttsRouter.speak(text, req.body.voiceId, req.body.tier);
  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', audioBuffer.length.toString());
  res.send(audioBuffer);
}));

app.get('/api/settings', (_req, res) => {
  res.json({
    ops: getOpsConfig(),
    tts: getTTSConfig(),
    brain: brainRouter.getConfig()
  });
});

app.put('/api/settings/ops', (req, res) => {
  const current = getOpsConfig();
  const next: OpsConfig = { ...current, ...req.body };
  res.json(setOpsConfig(next));
  EventBus.emit('ops:config', next);
});

app.get('/api/memory/conversations', (req, res) => {
  res.json({ conversations: memoryManager.listConversations(Number(req.query.limit ?? 50)) });
});

app.get('/api/memory/conversations/:id/messages', (req, res) => {
  res.json({ messages: memoryManager.listMessages(req.params.id, Number(req.query.limit ?? 100)) });
});

app.get('/api/memory/long-term', (_req, res) => {
  res.json({ memory: memoryManager.listLongTermMemory() });
});

app.put('/api/memory/long-term/:key', (req, res) => {
  memoryManager.upsertLongTermMemory(req.params.key, req.body.value?.toString() ?? '');
  res.json({ memory: memoryManager.listLongTermMemory() });
});

app.post('/api/maintenance/recover-keys', (_req, res) => {
  res.json({ recovered: keyPool.recoverExpiredKeys() });
});

app.get('/api/logs', (req, res) => {
  res.json({
    logs: keyPool.listUsageLogs(
      Number(req.query.limit ?? 100),
      req.query.provider?.toString(),
      req.query.type?.toString(),
      req.query.success === undefined ? undefined : req.query.success === 'true'
    )
  });
});

app.post('/api/ops/maintenance', (req, res) => {
  const { action } = req.body;
  if (action === 'vacuum') {
    db.exec('VACUUM;');
    res.json({ success: true, message: 'SQLite database vacuumed.' });
  } else if (action === 'clear-cache') {
    const cacheDir = path.resolve(__dirname, '../../../data/audio-cache');
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const f of files) {
        fs.unlinkSync(path.join(cacheDir, f));
      }
    }
    res.json({ success: true, message: 'Audio cache cleared.' });
  } else if (action === 'reset-exhausted') {
    const count = keyPool.recoverExpiredKeys();
    res.json({ success: true, message: `Recovered ${count} exhausted keys.` });
  } else {
    res.status(400).json({ error: 'Unknown maintenance action' });
  }
});

wss.on('connection', socket => {
  socket.send(JSON.stringify({ type: 'dashboard', payload: getDashboardSnapshot() }));
  const interval = setInterval(() => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'telemetry', payload: getTelemetry() }));
    }
  }, 1000);

  socket.on('close', () => clearInterval(interval));
});

for (const eventName of ['usage:logged', 'key:created', 'key:updated', 'key:deleted', 'key:status', 'brain:config', 'tts:audio-ready']) {
  EventBus.on(eventName, payload => broadcast({ type: eventName, payload }));
}

setInterval(() => {
  keyPool.recoverExpiredKeys();
}, getOpsConfig().autoRecoveryIntervalMs);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = Number(error.status || error.statusCode || 500);
  res.status(status).json({ error: error.message || String(error) });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

function getDashboardSnapshot() {
  return {
    telemetry: getTelemetry(),
    keys: keyPool.listKeys(),
    usageLogs: keyPool.listUsageLogs(100),
    usageSummary: keyPool.getUsageSummary(15),
    brainConfig: brainRouter.getConfig(),
    ttsConfig: getTTSConfig(),
    opsConfig: getOpsConfig()
  };
}

function getTelemetry() {
  const keys = keyPool.getSummary();
  const usage = keyPool.getUsageSummary(15);
  const brain = brainRouter.getConfig();

  return {
    now: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    keys,
    usage,
    healthPercent: usage.requests > 0 ? usage.successRate : keys.error > 0 ? 75 : 100,
    activeBrain: {
      provider: brain.activeProvider,
      model: brain.activeModel,
      autoFailover: brain.autoFailover
    }
  };
}

function broadcast(message: unknown) {
  const raw = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(raw);
    }
  }
}

function numericOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function validateKey(id: string) {
  const key = keyPool.getKey(id);
  if (!key) {
    const error = new Error(`API key not found: ${id}`) as any;
    error.status = 404;
    throw error;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpsConfig().requestTimeoutMs || 15000);

  try {
    let result: {
      ok: boolean;
      success: boolean;
      status: number;
      detail: string;
      error: string | null;
      tier?: string | null;
      quota_used?: number | null;
      quota_limit?: number | null;
      remaining_quota?: number | null;
      quota_reset_at?: string | null;
      is_exhausted?: boolean;
      exhausted_reason?: 'quota_exceeded' | 'expired_no_reset' | null;
    };

    try {
      result = await runValidationRequest(key.provider, key.secret || key.key_encrypted, controller.signal);
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      result = {
        ok: false,
        success: false,
        status: isTimeout ? 408 : 500,
        detail: isTimeout ? 'Validation request timed out' : (err.message || 'Validation request failed'),
        error: isTimeout ? 'Validation request timed out' : (err.message || 'Validation request failed'),
        tier: null
      };
    }

    const latencyMs = Date.now() - startedAt;
    keyPool.logUsage(id, 'key_validation', 0, result.ok, latencyMs, {
      provider: key.provider,
      statusCode: result.status,
      error: result.ok ? null : result.detail
    });

    if (result.ok) {
      const updates: any = {};
      if (result.tier) updates.tier = result.tier;
      if (result.quota_limit !== undefined && result.quota_limit !== null) {
        updates.quotaLimit = result.quota_limit;
      }
      if (result.quota_used !== undefined && result.quota_used !== null) {
        updates.quotaUsed = result.quota_used;
      }
      if (result.quota_reset_at !== undefined) {
        updates.resetAt = result.quota_reset_at;
      }

      keyPool.updateKey(id, updates);

      if (result.is_exhausted) {
        if (result.exhausted_reason === 'expired_no_reset') {
          keyPool.markResting(id, null, 'Ganti ke API baru, quotanya sudah habis', true);
        } else {
          keyPool.markResting(id, result.quota_reset_at ? new Date(result.quota_reset_at) : null, 'Kuota habis (ElevenLabs)', false);
        }
      } else {
        keyPool.setStatus(id, 'active', null);
      }
    } else if (result.status === 401 || result.status === 403) {
      keyPool.markError(id, result.detail);
    }

    const updatedKey = keyPool.listKeys().find(k => k.id === id) || null;
    return { ...result, latencyMs, key: updatedKey };
  } finally {
    clearTimeout(timeout);
  }
}

async function runValidationRequest(provider: string, secret: string, signal: AbortSignal) {
  let response: Response;

  try {
    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${secret.trim()}` },
        signal
      });
    } else if (provider === 'groq') {
      response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${secret.trim()}` },
        signal
      });
    } else if (provider === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': secret.trim(), 'anthropic-version': '2023-06-01' },
        signal
      });
    } else if (provider === 'google') {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret.trim())}`, { signal });
    } else if (provider === 'elevenlabs') {
      response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': secret.trim() },
        signal
      });
    } else if (provider === 'local') {
      const baseUrl = secret.trim().startsWith('http') ? secret.trim() : 'http://localhost:11434';
      try {
        response = await fetch(`${baseUrl}/api/tags`, { signal });
        if (response.status === 404) {
          response = await fetch(`${baseUrl}/v1/models`, { signal });
        }
      } catch (err: any) {
        return {
          ok: false,
          success: false,
          status: 503,
          detail: `Cannot connect to local AI endpoint at ${baseUrl}: ${err.message}`,
          error: `Cannot connect to local AI endpoint at ${baseUrl}: ${err.message}`,
          tier: null
        };
      }
    } else {
      return {
        ok: false,
        success: false,
        status: 400,
        detail: `No validation endpoint configured for provider ${provider}`,
        error: `No validation endpoint configured for provider ${provider}`,
        tier: null
      };
    }
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      success: false,
      status: isTimeout ? 408 : 500,
      detail: isTimeout ? 'Request timed out' : (err.message || 'Network request failed'),
      error: isTimeout ? 'Request timed out' : (err.message || 'Network request failed'),
      tier: null
    };
  }

  let detail = 'HTTP 200 OK · Validated';
  let extractedTier: string | null = null;
  let quotaUsed: number | null = null;
  let quotaLimit: number | null = null;
  let remainingQuota: number | null = null;
  let quotaResetAt: string | null = null;
  let isExhausted = false;
  let exhaustedReason: 'quota_exceeded' | 'expired_no_reset' | null = null;

  if (response.ok) {
    if (provider === 'elevenlabs') {
      try {
        const sub = await response.json();
        if (sub.tier) extractedTier = sub.tier;
        quotaUsed = typeof sub.character_count === 'number' ? sub.character_count : 0;
        quotaLimit = typeof sub.character_limit === 'number' ? sub.character_limit : null;
        if (sub.next_character_count_reset_unix && sub.next_character_count_reset_unix > 0) {
          quotaResetAt = new Date(sub.next_character_count_reset_unix * 1000).toISOString();
        }
        const usedNum = quotaUsed ?? 0;
        const limitNum = quotaLimit ?? 0;
        remainingQuota = quotaLimit !== null ? Math.max(0, limitNum - usedNum) : null;

        const isFreeDisabled = sub.status === 'free_disabled';
        const isLimitReached = quotaLimit !== null && usedNum >= limitNum;

        if (isFreeDisabled || (isLimitReached && !quotaResetAt)) {
          isExhausted = true;
          exhaustedReason = 'expired_no_reset';
          detail = `ElevenLabs: Kuota habis total (0 chars tersisa). Akun tanpa reset kuota — Ganti ke API baru.`;
        } else if (isLimitReached) {
          isExhausted = true;
          exhaustedReason = 'quota_exceeded';
          detail = `ElevenLabs: Kuota habis (${usedNum.toLocaleString()} / ${limitNum.toLocaleString()} chars). Istirahat sampai reset.`;
        } else {
          isExhausted = false;
          detail = `Subscription OK · Tier: ${(sub.tier || 'free').toUpperCase()} · Sisa: ${remainingQuota !== null ? remainingQuota.toLocaleString() : '∞'} / ${(limitNum > 0 ? limitNum.toLocaleString() : '∞')} chars`;
        }
      } catch {
        // use default detail
      }
    }
  } else {
    try {
      const json = await response.json();
      detail = json.error?.message || json.detail?.message || (typeof json.detail === 'string' ? json.detail : null) || json.message || JSON.stringify(json);
      if (typeof detail === 'string' && (detail.includes('quota') || detail.includes('character limit') || detail.includes('credit'))) {
        isExhausted = true;
        exhaustedReason = 'quota_exceeded';
      }
    } catch {
      detail = (await response.text()).slice(0, 300) || response.statusText;
    }
  }

  return {
    ok: response.ok,
    success: response.ok,
    status: response.status,
    detail,
    error: response.ok ? null : detail,
    tier: extractedTier,
    quota_used: quotaUsed,
    quota_limit: quotaLimit,
    remaining_quota: remainingQuota,
    quota_reset_at: quotaResetAt,
    is_exhausted: isExhausted,
    exhausted_reason: exhaustedReason
  };
}
