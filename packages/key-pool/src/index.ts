import { db, initDatabase } from '@neuro/memory';
import crypto from 'crypto';
import {
  ApiKey,
  ApiKeyStatus,
  EventBus,
  PublicApiKey,
  decryptKey,
  encryptKey,
  fingerprintSecret,
  maskSecret
} from '@neuro/core';

export interface AddApiKeyInput {
  provider: string;
  key: string;
  tier?: string | null;
  status?: ApiKeyStatus;
  quotaLimit?: number | null;
  quotaUsed?: number;
  priority?: number;
}

export interface UpdateApiKeyInput {
  provider?: string;
  tier?: string | null;
  status?: ApiKeyStatus;
  quotaLimit?: number | null;
  quotaUsed?: number;
  priority?: number;
  resetAt?: string | null;
}

export interface UsageLogInput {
  keyId: string | null;
  provider?: string | null;
  model?: string | null;
  requestType: string;
  tokensOrChars: number;
  success: boolean;
  latencyMs: number;
  statusCode?: number | null;
  error?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const ACTIVE_STATUSES: ApiKeyStatus[] = ['active', 'exhausted', 'error', 'disabled'];

function normalizeProvider(provider: string) {
  return provider.trim().toLowerCase();
}

function toPublicKey(row: ApiKey, isLocked = false): PublicApiKey {
  const secret = decryptKey(row.key_encrypted);
  const quotaLimit = row.quota_limit ?? null;
  const quotaUsed = Number(row.quota_used ?? 0);

  return {
    id: row.id,
    provider: row.provider,
    tier: row.tier ?? null,
    status: row.status,
    quota_limit: quotaLimit,
    quota_used: quotaUsed,
    quota_reset_at: row.quota_reset_at ?? null,
    priority: Number(row.priority ?? 0),
    last_used_at: row.last_used_at ?? null,
    last_error: row.last_error ?? null,
    rest_until: row.quota_reset_at ?? null,
    exhausted_reason: (row as any).exhausted_reason ?? null,
    created_at: row.created_at,
    maskedKey: maskSecret(secret),
    usagePercent: quotaLimit ? Math.min(100, Number(((quotaUsed / quotaLimit) * 100).toFixed(2))) : null,
    remainingQuota: quotaLimit ? Math.max(0, quotaLimit - quotaUsed) : null,
    is_locked: isLocked
  };
}

function parseStatus(status?: string): ApiKeyStatus {
  if (status && ACTIVE_STATUSES.includes(status as ApiKeyStatus)) {
    return status as ApiKeyStatus;
  }
  return 'active';
}

export class KeyPoolManager {
  private activeWorkerLocks = new Set<string>();

  constructor() {
    initDatabase();
  }

  public isWorkerLocked(keyId: string): boolean {
    return this.activeWorkerLocks.has(keyId);
  }

  public releaseWorkerKey(keyId: string): void {
    this.activeWorkerLocks.delete(keyId);
  }

  public getLockedKeysCount(): number {
    return this.activeWorkerLocks.size;
  }

  public acquireWorkerKey(provider: string, excludeKeyIds?: Set<string>, preferredTier?: string): ApiKey | null {
    this.recoverExpiredKeys();

    const query = `
      SELECT * FROM api_keys 
      WHERE provider = ? AND status = 'active'
        AND (quota_limit IS NULL OR quota_used < quota_limit)
    `;
    const params: any[] = [normalizeProvider(provider)];
    const allRows = db.prepare(query).all(...params) as ApiKey[];

    const available = allRows.filter(k => {
      if (this.activeWorkerLocks.has(k.id)) return false;
      if (excludeKeyIds && excludeKeyIds.has(k.id)) return false;
      return true;
    });

    if (available.length === 0) {
      return null;
    }

    // Sort by preferred tier (if matched), then priority DESC, then lowest quota ratio, then oldest last_used_at
    available.sort((a, b) => {
      if (preferredTier) {
        const aMatch = a.tier === preferredTier ? 1 : 0;
        const bMatch = b.tier === preferredTier ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      if ((b.priority || 0) !== (a.priority || 0)) {
        return (b.priority || 0) - (a.priority || 0);
      }
      const aUsedRatio = a.quota_limit ? (a.quota_used || 0) / a.quota_limit : 0;
      const bUsedRatio = b.quota_limit ? (b.quota_used || 0) / b.quota_limit : 0;
      if (aUsedRatio !== bUsedRatio) {
        return aUsedRatio - bUsedRatio;
      }
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return aTime - bTime;
    });

    const selected = available[0];
    this.activeWorkerLocks.add(selected.id);
    db.prepare(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(selected.id);
    const secret = decryptKey(selected.key_encrypted);
    selected.secret = secret;
    selected.key_encrypted = secret;
    return selected;
  }

  public acquire(provider: string, tier?: string): ApiKey | null {
    this.recoverExpiredKeys();

    let query = `
      SELECT * FROM api_keys 
      WHERE provider = ? AND status = 'active'
        AND (quota_limit IS NULL OR quota_used < quota_limit)
    `;
    const params: any[] = [normalizeProvider(provider)];

    if (tier) {
      query += ` AND tier = ?`;
      params.push(tier);
    }

    query += `
      ORDER BY
        priority DESC,
        CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END ASC,
        last_used_at ASC
      LIMIT 1
    `;

    const stmt = db.prepare(query);
    const key = stmt.get(...params) as ApiKey | undefined;

    if (key) {
      db.prepare(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(key.id);
      const secret = decryptKey(key.key_encrypted);
      key.secret = secret;
      key.key_encrypted = secret;
      return key;
    }
    return null;
  }

  public getKey(id: string): ApiKey | null {
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKey | undefined;
    if (!row) {
      return null;
    }

    const secret = decryptKey(row.key_encrypted);
    row.secret = secret;
    row.key_encrypted = secret;
    return row;
  }

  public listKeys(provider?: string): PublicApiKey[] {
    const params: string[] = [];
    let query = 'SELECT * FROM api_keys';
    if (provider && provider !== 'all') {
      query += ' WHERE provider = ?';
      params.push(normalizeProvider(provider));
    }
    query += ' ORDER BY provider ASC, priority DESC, created_at DESC';
    return (db.prepare(query).all(...params) as ApiKey[]).map(r => toPublicKey(r, this.activeWorkerLocks.has(r.id)));
  }

  public addKey(input: AddApiKeyInput): PublicApiKey {
    const provider = normalizeProvider(input.provider);
    const secret = input.key.trim();
    if (!provider) {
      throw new Error('Provider is required');
    }
    if (!secret) {
      throw new Error('API key is required');
    }

    const id = cryptoRandomId('key');
    db.prepare(`
      INSERT INTO api_keys (
        id, provider, tier, key_encrypted, key_hash, status,
        quota_limit, quota_used, priority, quota_reset_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id,
      provider,
      input.tier ?? null,
      encryptKey(secret),
      fingerprintSecret(secret),
      parseStatus(input.status),
      input.quotaLimit ?? null,
      input.quotaUsed ?? 0,
      input.priority ?? 0
    );

    EventBus.emit('key:created', { id, provider });
    return this.listKeys().find(key => key.id === id)!;
  }

  public updateKey(id: string, input: UpdateApiKeyInput): PublicApiKey {
    const existing = db.prepare('SELECT id FROM api_keys WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`API key not found: ${id}`);
    }

    const current = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKey;
    db.prepare(`
      UPDATE api_keys
      SET provider = ?,
          tier = ?,
          status = ?,
          quota_limit = ?,
          quota_used = ?,
          priority = ?,
          quota_reset_at = ?
      WHERE id = ?
    `).run(
      input.provider ? normalizeProvider(input.provider) : current.provider,
      input.tier === undefined ? current.tier ?? null : input.tier,
      parseStatus(input.status ?? current.status),
      input.quotaLimit === undefined ? current.quota_limit ?? null : input.quotaLimit,
      input.quotaUsed === undefined ? current.quota_used ?? 0 : input.quotaUsed,
      input.priority === undefined ? current.priority ?? 0 : input.priority,
      input.resetAt === undefined ? current.quota_reset_at ?? null : input.resetAt,
      id
    );

    EventBus.emit('key:updated', { id });
    return this.listKeys().find(key => key.id === id)!;
  }

  public rotateKey(id: string, secret: string, resetQuota = true): PublicApiKey {
    const trimmedSecret = secret.trim();
    if (!trimmedSecret) {
      throw new Error('Replacement API key is required');
    }

    const result = db.prepare(`
      UPDATE api_keys
      SET key_encrypted = ?,
          key_hash = ?,
          status = 'active',
          quota_used = CASE WHEN ? THEN 0 ELSE quota_used END,
          quota_reset_at = NULL,
          last_error = NULL,
          last_used_at = NULL
      WHERE id = ?
    `).run(encryptKey(trimmedSecret), fingerprintSecret(trimmedSecret), resetQuota ? 1 : 0, id);

    if (result.changes === 0) {
      throw new Error(`API key not found: ${id}`);
    }

    EventBus.emit('key:rotated', { id });
    return this.listKeys().find(key => key.id === id)!;
  }

  public setStatus(id: string, status: ApiKeyStatus, error?: string | null): PublicApiKey {
    const result = db.prepare(`
      UPDATE api_keys
      SET status = ?,
          last_error = ?,
          quota_reset_at = CASE WHEN ? = 'active' THEN NULL ELSE quota_reset_at END
      WHERE id = ?
    `).run(status, error ?? null, status, id);

    if (result.changes === 0) {
      throw new Error(`API key not found: ${id}`);
    }

    EventBus.emit('key:status', { id, status });
    return this.listKeys().find(key => key.id === id)!;
  }

  public deleteKey(id: string) {
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    if (result.changes === 0) {
      throw new Error(`API key not found: ${id}`);
    }
    EventBus.emit('key:deleted', { id });
  }

  public markResting(id: string, resetAt: Date | null, reason: string, isPermanent = false) {
    this.activeWorkerLocks.delete(id);

    if (isPermanent) {
      db.prepare(`
        UPDATE api_keys 
        SET status = 'exhausted', quota_reset_at = NULL, exhausted_reason = 'expired_no_reset', last_error = ?
        WHERE id = ?
      `).run('Ganti ke API baru, quotanya sudah habis', id);
    } else {
      const resetIso = resetAt ? resetAt.toISOString() : new Date(Date.now() + 3600 * 1000).toISOString();
      const resetStr = resetAt ? resetAt.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '1 jam';
      db.prepare(`
        UPDATE api_keys 
        SET status = 'exhausted', quota_reset_at = ?, exhausted_reason = 'quota_exceeded', last_error = ?
        WHERE id = ?
      `).run(resetIso, `Istirahat sampai ${resetStr} (${reason})`, id);
    }

    EventBus.emit('key:updated', { id });
    EventBus.emit('key:status', { id, status: 'exhausted' });
  }

  public markExhausted(id: string, resetAt?: Date, error?: string) {
    this.activeWorkerLocks.delete(id);
    db.prepare(`
      UPDATE api_keys 
      SET status = 'exhausted', quota_reset_at = ?, last_error = ?
      WHERE id = ?
    `).run(resetAt ? resetAt.toISOString() : null, error ?? 'quota or rate limit reached', id);
    EventBus.emit('key:exhausted', { id, resetAt: resetAt?.toISOString() ?? null });
  }

  public markError(id: string, error?: string) {
    this.activeWorkerLocks.delete(id);
    db.prepare(`
      UPDATE api_keys
      SET status = 'error', last_error = ?
      WHERE id = ?
    `).run(error ?? 'provider request failed', id);
    EventBus.emit('key:error', { id, error });
  }

  public recoverExpiredKeys(now = new Date()) {
    const result = db.prepare(`
      UPDATE api_keys
      SET status = 'active', quota_reset_at = NULL, quota_used = 0, last_error = NULL, exhausted_reason = NULL
      WHERE status = 'exhausted'
        AND quota_reset_at IS NOT NULL
        AND datetime(quota_reset_at) <= datetime(?)
    `).run(now.toISOString());

    if (result.changes > 0) {
      EventBus.emit('key:recovered', { count: result.changes });
    }

    return result.changes;
  }

  public resetQuota(id: string) {
    const result = db.prepare(`
      UPDATE api_keys
      SET quota_used = 0, quota_reset_at = NULL, status = 'active', last_error = NULL
      WHERE id = ?
    `).run(id);
    if (result.changes === 0) {
      throw new Error(`API key not found: ${id}`);
    }
    EventBus.emit('key:quota-reset', { id });
    return this.listKeys().find(key => key.id === id)!;
  }

  public logUsage(
    keyId: string | null,
    requestType: string,
    tokensOrChars: number,
    success: boolean,
    latencyMs: number,
    extra: Partial<Omit<UsageLogInput, 'keyId' | 'requestType' | 'tokensOrChars' | 'success' | 'latencyMs'>> = {}
  ) {
    const row = keyId ? db.prepare('SELECT provider FROM api_keys WHERE id = ?').get(keyId) as { provider: string } | undefined : undefined;
    db.prepare(`
      INSERT INTO usage_log (
        key_id, provider, model, request_type, tokens_or_chars, success,
        status_code, latency_ms, error, request_id, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      keyId,
      extra.provider ?? row?.provider ?? null,
      extra.model ?? null,
      requestType,
      Math.max(0, Math.round(tokensOrChars)),
      success ? 1 : 0,
      extra.statusCode ?? null,
      Math.max(0, Math.round(latencyMs)),
      extra.error ?? null,
      extra.requestId ?? cryptoRandomId('req'),
      extra.metadata ? JSON.stringify(extra.metadata) : null
    );

    if (success && keyId) {
      db.prepare(`
        UPDATE api_keys SET quota_used = quota_used + ? WHERE id = ?
      `).run(Math.max(0, Math.round(tokensOrChars)), keyId);
    }

    EventBus.emit('usage:logged', { keyId, requestType, success });
  }

  public getSummary() {
    const total = db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
    const rows = db.prepare(`
      SELECT provider, status, COUNT(*) as count
      FROM api_keys
      GROUP BY provider, status
      ORDER BY provider ASC
    `).all() as { provider: string; status: ApiKeyStatus; count: number }[];

    const byProvider: Record<string, Record<ApiKeyStatus, number> & { total: number }> = {};
    for (const row of rows) {
      byProvider[row.provider] ??= { active: 0, exhausted: 0, error: 0, disabled: 0, total: 0 };
      byProvider[row.provider][row.status] = row.count;
      byProvider[row.provider].total += row.count;
    }

    const statusTotals = { active: 0, exhausted: 0, error: 0, disabled: 0 };
    for (const row of rows) {
      statusTotals[row.status] += row.count;
    }

    return { total: total.count, ...statusTotals, byProvider };
  }

  public listUsageLogs(limit = 100, provider?: string, requestType?: string, success?: boolean) {
    const params: any[] = [];
    const where: string[] = [];

    if (provider && provider !== 'all') {
      where.push('u.provider = ?');
      params.push(normalizeProvider(provider));
    }
    if (requestType && requestType !== 'all') {
      where.push('u.request_type = ?');
      params.push(requestType);
    }
    if (typeof success === 'boolean') {
      where.push('u.success = ?');
      params.push(success ? 1 : 0);
    }

    const query = `
      SELECT u.id,
             u.key_id as keyId,
             u.provider,
             u.model,
             u.request_type as requestType,
             u.tokens_or_chars as tokensOrChars,
             u.success,
             u.status_code as statusCode,
             u.latency_ms as latencyMs,
             u.error,
             u.request_id as requestId,
             u.created_at as createdAt,
             u.metadata,
             k.tier as keyTier
      FROM usage_log u
      LEFT JOIN api_keys k ON k.id = u.key_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ?
    `;
    params.push(Math.min(Math.max(limit, 1), 500));
    return db.prepare(query).all(...params);
  }

  public getUsageSummary(minutes = 15) {
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT provider,
             request_type as requestType,
             COUNT(*) as requests,
             SUM(tokens_or_chars) as volume,
             SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
             AVG(latency_ms) as avgLatency,
             MAX(latency_ms) as maxLatency
      FROM usage_log
      WHERE datetime(created_at) >= datetime(?)
      GROUP BY provider, request_type
    `).all(since);

    const totals = db.prepare(`
      SELECT COUNT(*) as requests,
             SUM(tokens_or_chars) as volume,
             SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
             AVG(latency_ms) as avgLatency
      FROM usage_log
      WHERE datetime(created_at) >= datetime(?)
    `).get(since) as any;

    return {
      windowMinutes: minutes,
      requests: Number(totals.requests ?? 0),
      volume: Number(totals.volume ?? 0),
      successes: Number(totals.successes ?? 0),
      successRate: totals.requests ? Number(((totals.successes / totals.requests) * 100).toFixed(2)) : 100,
      throughput: Number(((totals.requests ?? 0) / (minutes * 60)).toFixed(2)),
      avgLatency: totals.avgLatency ? Math.round(totals.avgLatency) : 0,
      byProvider: rows
    };
  }
}

export const keyPool = new KeyPoolManager();

function cryptoRandomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}
