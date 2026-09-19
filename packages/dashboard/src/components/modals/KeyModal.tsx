import { useState, useMemo, type FC, type FormEvent } from 'react';
import { apiRequest, type PublicApiKey } from '../../api';

interface KeyModalProps {
  initialMode?: 'new' | 'batch' | 'rotate';
  targetKey?: PublicApiKey | null;
  existingKeys?: PublicApiKey[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

interface ParsedBatchItem {
  id: string;
  key: string;
  provider: string;
  tier: string;
  priority: number;
  quotaLimit: number | null;
  quotaUsed?: number;
  remainingQuota?: number | null;
  resetAt?: string | null;
  exhaustedReason?: string | null;
  status: 'active' | 'disabled';
  masked: string;
  validationStatus: 'untested' | 'validating' | 'valid' | 'invalid';
  validationDetail?: string;
  latencyMs?: number;
}

function maskKeyPreview(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return '****';
  if (s.length <= 16) return `${s.slice(0, 3)}...${s.slice(-3)}`;
  return `${s.slice(0, 7)}...${s.slice(-4)}`;
}

function detectProvider(keyStr: string, fallback: string): string {
  const s = keyStr.trim().toLowerCase();
  if (s.startsWith('sk-ant-')) return 'anthropic';
  if (s.startsWith('gsk_')) return 'groq';
  if (s.startsWith('aiza')) return 'google';
  if (s.startsWith('sk-') || s.startsWith('sess-')) return 'openai';
  if (/^[0-9a-f]{32}$/i.test(s) || s.startsWith('key_')) return 'elevenlabs';
  if (s.startsWith('http://') || s.startsWith('https://')) return 'local';
  return fallback === 'auto' ? 'openai' : fallback;
}

export const KeyModal: FC<KeyModalProps> = ({
  initialMode = 'new',
  targetKey = null,
  existingKeys = [],
  onClose,
  onSaved
}) => {
  const [mode, setMode] = useState<'new' | 'batch' | 'rotate'>(initialMode);
  const [provider, setProvider] = useState<string>(targetKey?.provider || 'anthropic');
  const [tier, setTier] = useState<string>(targetKey?.tier || 'pro');
  const [keyToken, setKeyToken] = useState<string>('');
  const [quotaLimit, setQuotaLimit] = useState<string>(targetKey?.quota_limit ? String(targetKey.quota_limit) : '');
  const [priority, setPriority] = useState<number>(targetKey?.priority ?? 10);
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(targetKey?.id || (existingKeys[0]?.id ?? ''));
  const [resetQuota, setResetQuota] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Batch Mode States
  const [batchText, setBatchText] = useState<string>('');
  const [batchProvider, setBatchProvider] = useState<string>('auto');
  const [batchTier, setBatchTier] = useState<string>('pro');
  const [batchPriority, setBatchPriority] = useState<number>(10);
  const [priorityStrategy, setPriorityStrategy] = useState<'same' | 'descending'>('descending');
  const [batchQuotaLimit, setBatchQuotaLimit] = useState<string>('');
  const [batchStatus, setBatchStatus] = useState<'active' | 'disabled'>('active');
  const [validationOverrides, setValidationOverrides] = useState<Record<string, {
    status: 'untested' | 'validating' | 'valid' | 'invalid';
    detail?: string;
    latencyMs?: number;
    tier?: string;
    quotaLimit?: number | null;
    quotaUsed?: number | null;
    remainingQuota?: number | null;
    resetAt?: string | null;
    exhaustedReason?: string | null;
  }>>({});
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());

  const providers = [
    { id: 'anthropic', label: 'Anthropic', icon: 'psychology', tone: 'text-primary' },
    { id: 'openai', label: 'OpenAI', icon: 'hub', tone: 'text-tertiary' },
    { id: 'elevenlabs', label: 'ElevenLabs', icon: 'record_voice_over', tone: 'text-secondary' },
    { id: 'groq', label: 'Groq Cloud', icon: 'bolt', tone: 'text-tertiary' },
    { id: 'google', label: 'Google AI', icon: 'auto_awesome', tone: 'text-secondary' },
    { id: 'local', label: 'Local vLLM', icon: 'dns', tone: 'text-primary' },
  ];

  const batchProviders = [
    { id: 'auto', label: '⚡ Auto-Detect', icon: 'auto_awesome', tone: 'text-primary' },
    ...providers
  ];

  // Parse batch text into structured items
  const { parsedItems, duplicatesCount } = useMemo(() => {
    if (!batchText.trim()) return { parsedItems: [], duplicatesCount: 0 };

    const rawLines = batchText
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

    const seenKeys = new Set<string>();
    let duplicates = 0;
    const items: ParsedBatchItem[] = [];

    rawLines.forEach((line, idx) => {
      // Clean up common bullet points or numbering (e.g. "1. sk-...", "- sk-...")
      let cleaned = line.replace(/^[\d+.\-*\s>]+/, '').trim();
      cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

      if (!cleaned) return;

      // Extract provider prefix if specified like "elevenlabs:key_xxx" or "openai:sk-xxx"
      let itemProvider = batchProvider;
      let itemKey = cleaned;
      let itemTier = batchTier;
      let itemPriority = priorityStrategy === 'descending' ? Math.max(1, batchPriority - idx) : batchPriority;

      if (cleaned.includes(':') && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        const parts = cleaned.split(':');
        const candidateProvider = parts[0].trim().toLowerCase();
        if (providers.some(p => p.id === candidateProvider)) {
          itemProvider = candidateProvider;
          itemKey = parts.slice(1).join(':').trim();
        }
      }

      // Check for inline commas (e.g. "sk-xxx, pro, 15")
      if (itemKey.includes(',')) {
        const segs = itemKey.split(',').map(s => s.trim());
        itemKey = segs[0];
        if (segs[1]) itemTier = segs[1];
        if (segs[2] && !isNaN(Number(segs[2]))) itemPriority = Number(segs[2]);
      }

      // Resolve final provider
      const finalProvider = itemProvider === 'auto' ? detectProvider(itemKey, 'openai') : itemProvider;

      if (seenKeys.has(itemKey)) {
        duplicates++;
        return;
      }
      seenKeys.add(itemKey);

      const id = `item-${idx}-${itemKey.slice(-6)}`;
      if (removedItemIds.has(id)) return;

      const override = validationOverrides[id];

      items.push({
        id,
        key: itemKey,
        provider: finalProvider,
        tier: override?.tier || itemTier,
        priority: itemPriority,
        quotaLimit: override?.quotaLimit !== undefined ? override.quotaLimit : (batchQuotaLimit ? Number(batchQuotaLimit) : null),
        quotaUsed: override?.quotaUsed ?? 0,
        remainingQuota: override?.remainingQuota ?? null,
        resetAt: override?.resetAt ?? null,
        exhaustedReason: override?.exhaustedReason ?? null,
        status: override?.exhaustedReason ? 'disabled' : batchStatus,
        masked: maskKeyPreview(itemKey),
        validationStatus: override?.status || 'untested',
        validationDetail: override?.detail,
        latencyMs: override?.latencyMs
      });
    });

    return { parsedItems: items, duplicatesCount: duplicates };
  }, [batchText, batchProvider, batchTier, batchPriority, priorityStrategy, batchQuotaLimit, batchStatus, validationOverrides, removedItemIds]);

  const handleValidateSingle = async () => {
    if (!keyToken.trim()) {
      setError('Please paste a secret key first.');
      return;
    }
    setValidating(true);
    setError(null);
    setSuccessInfo(null);
    try {
      const res = await apiRequest<{
        ok?: boolean;
        success?: boolean;
        status?: number;
        latencyMs?: number;
        detail?: string;
        error?: string | null;
        tier?: string | null;
        quota_used?: number | null;
        quota_limit?: number | null;
        remaining_quota?: number | null;
        quota_reset_at?: string | null;
        is_exhausted?: boolean;
        exhausted_reason?: string | null;
      }>('/api/keys/validate', {
        method: 'POST',
        body: JSON.stringify({ provider, key: keyToken.trim() })
      });
      const isSuccess = Boolean(res.ok || res.success);
      if (isSuccess) {
        if (res.tier) {
          setTier(res.tier);
        }
        if (res.quota_limit !== undefined && res.quota_limit !== null) {
          setQuotaLimit(String(res.quota_limit));
        }
        setSuccessInfo(res.detail || `Validated successfully: HTTP ${res.status || 200} OK (${res.latencyMs || 0}ms)`);
      } else {
        setError(`Validation failed (${res.status || 400}): ${res.error || res.detail || 'Invalid credential'}`);
      }
    } catch (err: any) {
      setError(err.message || 'Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  const handleValidateBatch = async () => {
    if (parsedItems.length === 0) {
      setError('No valid keys found to validate.');
      return;
    }
    setValidating(true);
    setError(null);
    setSuccessInfo(null);

    try {
      for (const item of parsedItems) {
        setValidationOverrides(prev => ({
          ...prev,
          [item.id]: { status: 'validating' }
        }));

        try {
          const res = await apiRequest<{
            ok?: boolean;
            success?: boolean;
            status?: number;
            latencyMs?: number;
            detail?: string;
            error?: string | null;
            tier?: string | null;
            quota_used?: number | null;
            quota_limit?: number | null;
            remaining_quota?: number | null;
            quota_reset_at?: string | null;
            is_exhausted?: boolean;
            exhausted_reason?: string | null;
          }>('/api/keys/validate', {
            method: 'POST',
            body: JSON.stringify({ provider: item.provider, key: item.key })
          });
          const ok = Boolean(res.ok || res.success);
          setValidationOverrides(prev => ({
            ...prev,
            [item.id]: {
              status: ok ? 'valid' : 'invalid',
              detail: ok ? (res.detail || `OK 200 (${res.latencyMs}ms)`) : (res.error || res.detail || 'Validation failed'),
              latencyMs: res.latencyMs,
              tier: res.tier || item.tier,
              quotaLimit: res.quota_limit ?? item.quotaLimit,
              quotaUsed: res.quota_used ?? 0,
              remainingQuota: res.remaining_quota ?? null,
              resetAt: res.quota_reset_at ?? null,
              exhaustedReason: res.exhausted_reason ?? null
            }
          }));
        } catch (err: any) {
          setValidationOverrides(prev => ({
            ...prev,
            [item.id]: {
              status: 'invalid',
              detail: err.message || 'Request failed'
            }
          }));
        }
      }
      setSuccessInfo(`Validation batch completed for ${parsedItems.length} keys.`);
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveBatchItem = (id: string) => {
    setRemovedItemIds(prev => new Set(prev).add(id));
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setBatchText(prev => (prev ? `${prev}\n${text}` : text));
        setError(null);
      }
    } catch (err) {
      setError('Unable to access clipboard automatically. Please press Ctrl+V to paste.');
    }
  };

  const handleLoadDemoBatch = () => {
    setBatchText(
`# Sample Keys format demo
sk-ant-api03-sample999111222333444555666777888999
sk-proj-demo999888777666555444333222111000aaa
groq:gsk_sampledemo111222333444555666777888999
elevenlabs:key_sampletierpro111222333444555`
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessInfo(null);

    try {
      if (mode === 'batch') {
        if (parsedItems.length === 0) {
          setError('No keys detected to import. Please paste at least one API key.');
          setLoading(false);
          return;
        }

        const payload = {
          keys: parsedItems.map(item => ({
            provider: item.provider,
            key: item.key,
            tier: item.tier.trim() || null,
            priority: item.priority,
            quotaLimit: item.quotaLimit,
            quotaUsed: item.quotaUsed ?? 0,
            resetAt: item.resetAt ?? null,
            exhausted_reason: item.exhaustedReason ?? null,
            status: item.exhaustedReason ? 'exhausted' : item.status
          }))
        };

        const res = await apiRequest<{
          success: boolean;
          count: number;
          imported: PublicApiKey[];
          failed: Array<{ key: string; error: string }>;
        }>('/api/keys/batch', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.imported && res.imported.length > 0) {
          onSaved(`Successfully imported ${res.imported.length} API keys into failover pool.`);
          onClose();
        } else if (res.failed && res.failed.length > 0) {
          setError(`Failed to import keys: ${res.failed[0].error}`);
        } else {
          setError('No keys were imported.');
        }
      } else if (mode === 'rotate' && selectedTargetId) {
        if (!keyToken.trim()) {
          setError('Secret API Key is required');
          setLoading(false);
          return;
        }
        await apiRequest(`/api/keys/${selectedTargetId}/rotate`, {
          method: 'POST',
          body: JSON.stringify({ key: keyToken.trim(), resetQuota })
        });
        onSaved(`Hot-swap complete. Key rotated successfully.`);
        onClose();
      } else {
        if (!keyToken.trim()) {
          setError('Secret API Key is required');
          setLoading(false);
          return;
        }
        await apiRequest('/api/keys', {
          method: 'POST',
          body: JSON.stringify({
            provider,
            tier: tier.trim() || null,
            key: keyToken.trim(),
            quotaLimit: quotaLimit ? Number(quotaLimit) : null,
            priority: Number(priority),
            status
          })
        });
        onSaved(`Key added and injected into live failover pool.`);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save key(s)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-container-lowest/80 backdrop-blur-md z-50 flex items-center justify-center p-space-md overflow-y-auto">
      <div className={`bg-surface-container-low border border-outline-variant/40 rounded-xl shadow-2xl w-full ${mode === 'batch' ? 'max-w-3xl' : 'max-w-2xl'} flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150`}>
        {/* Header */}
        <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-outline-variant/30">
          <div>
            <div className="flex items-center gap-space-xs">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  {mode === 'batch' ? 'dynamic_feed' : mode === 'rotate' ? 'sync' : 'vpn_key_alert'}
                </span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                {mode === 'batch'
                  ? 'Batch API Key Ingestion'
                  : mode === 'rotate'
                  ? 'Hot-Swap / Rotate API Key'
                  : 'Register Single API Key'}
              </h3>
            </div>
            <p className="font-code-dense text-code-dense text-on-surface-variant mt-0.5">
              {mode === 'batch'
                ? 'Rapidly ingest multiple API keys at once with automatic provider detection and failover cascading'
                : 'Register a fresh credential or seamlessly hot-swap an active key in the failover pool'}
            </p>
          </div>
          <div className="flex items-center gap-space-xs">
            <span className="font-code-dense text-code-dense px-space-xs py-0.5 rounded bg-surface-container-highest text-outline">
              ESC
            </span>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-md max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-space-xs px-space-sm rounded-lg bg-error/10 border border-error/30 text-error font-code-dense text-code-dense flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}
          {successInfo && (
            <div className="p-space-xs px-space-sm rounded-lg bg-primary/10 border border-primary/30 text-primary font-code-dense text-code-dense flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>{successInfo}</span>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-0.5 bg-surface-container-lowest rounded-lg border border-outline-variant/30">
            <button
              type="button"
              onClick={() => { setMode('new'); setError(null); }}
              className={`flex-1 py-space-xs px-space-sm rounded font-label-mono-sm text-label-mono-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'new'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">vpn_key</span>
              <span>Single Key</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('batch'); setError(null); }}
              className={`flex-1 py-space-xs px-space-sm rounded font-label-mono-sm text-label-mono-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'batch'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">dynamic_feed</span>
              <span>Batch Import</span>
              {parsedItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/20 text-primary font-mono">
                  {parsedItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setMode('rotate'); setError(null); }}
              className={`flex-1 py-space-xs px-space-sm rounded font-label-mono-sm text-label-mono-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'rotate'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">sync</span>
              <span>Hot-Swap / Rotate</span>
            </button>
          </div>

          {/* ======================= BATCH MODE VIEW ======================= */}
          {mode === 'batch' && (
            <div className="flex flex-col gap-space-md">
              {/* Batch Provider Selector */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Target Provider / Default
                  </label>
                  <span className="font-code-dense text-code-dense text-primary">
                    Auto-detects Anthropic, OpenAI, Groq, Google, ElevenLabs
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-xs">
                  {batchProviders.map((p) => (
                    <label
                      key={p.id}
                      onClick={() => setBatchProvider(p.id)}
                      className={`flex items-center gap-space-xs p-space-xs rounded-lg border cursor-pointer transition-colors ${
                        batchProvider === p.id
                          ? 'bg-surface-container-high border-primary text-on-surface shadow-sm'
                          : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="radio"
                        name="batch-modal-provider"
                        value={p.id}
                        checked={batchProvider === p.id}
                        onChange={() => setBatchProvider(p.id)}
                        className="accent-primary sr-only"
                      />
                      <span className={`material-symbols-outlined text-[18px] ${p.tone}`}>{p.icon}</span>
                      <span className="font-label-mono-sm text-label-mono-sm font-medium">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Batch Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm p-space-sm bg-surface-container rounded-lg border border-outline-variant/30">
                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Tier Label
                  </label>
                  <input
                    type="text"
                    value={batchTier}
                    onChange={(e) => setBatchTier(e.target.value)}
                    placeholder="e.g. pro, free"
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-1 font-label-mono-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                      Priority Rank
                    </label>
                    <button
                      type="button"
                      onClick={() => setPriorityStrategy(s => s === 'same' ? 'descending' : 'same')}
                      className="text-[11px] text-primary hover:underline font-code-dense cursor-pointer"
                      title="Click to toggle priority assignment strategy"
                    >
                      {priorityStrategy === 'descending' ? 'Cascade: 10,9,8..' : 'Equal'}
                    </button>
                  </div>
                  <input
                    type="number"
                    value={batchPriority}
                    onChange={(e) => setBatchPriority(Number(e.target.value))}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-1 font-code-dense text-code-dense text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Quota Limit
                  </label>
                  <input
                    type="number"
                    value={batchQuotaLimit}
                    onChange={(e) => setBatchQuotaLimit(e.target.value)}
                    placeholder="Optional (unlimited)"
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-1 font-code-dense text-code-dense text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Initial Status
                  </label>
                  <select
                    value={batchStatus}
                    onChange={(e) => setBatchStatus(e.target.value as 'active' | 'disabled')}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-1 font-label-mono-sm text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="active">Active (Routeable)</option>
                    <option value="disabled">Disabled / Staged</option>
                  </select>
                </div>
              </div>

              {/* Textarea Multi-Key Ingestion */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-space-xs">
                    <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                      Keys Input Stream (1 Per Line)
                    </label>
                    <span className="font-code-dense text-[11px] px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">
                      {parsedItems.length} Detected
                    </span>
                    {duplicatesCount > 0 && (
                      <span className="font-code-dense text-[11px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                        {duplicatesCount} Duplicates Skipped
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 font-code-dense cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_paste</span> Paste Clipboard
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadDemoBatch}
                      className="text-[11px] text-outline hover:text-on-surface font-code-dense cursor-pointer"
                    >
                      Sample
                    </button>
                    {batchText && (
                      <button
                        type="button"
                        onClick={() => { setBatchText(''); setValidationOverrides({}); }}
                        className="text-[11px] text-error/80 hover:text-error font-code-dense cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`Paste multiple keys here (one key per line):\nsk-ant-api03-xxxx...\nsk-proj-yyyy...\ngroq:gsk_zzzz...\nelevenlabs:key_aaaa...`}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-space-sm font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary transition-colors leading-relaxed"
                />
              </div>

              {/* Parsed Preview Table */}
              {parsedItems.length > 0 && (
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                      Batch Keys Preview &amp; Validation Queue ({parsedItems.length})
                    </span>
                    <span className="font-code-dense text-code-dense text-outline">
                      Review before importing
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-outline-variant/30 bg-surface-container-lowest">
                    <table className="w-full text-left font-code-dense text-code-dense border-collapse">
                      <thead className="bg-surface-container text-outline uppercase sticky top-0 border-b border-outline-variant/20">
                        <tr>
                          <th className="py-1 px-space-sm w-8">#</th>
                          <th className="py-1 px-space-sm">Provider</th>
                          <th className="py-1 px-space-sm">Masked Key</th>
                          <th className="py-1 px-space-sm">Tier</th>
                          <th className="py-1 px-space-sm">Pri</th>
                          <th className="py-1 px-space-sm">Quota Live</th>
                          <th className="py-1 px-space-sm">Status / Check</th>
                          <th className="py-1 px-space-xs text-right w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {parsedItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-surface-container-high/30">
                            <td className="py-1 px-space-sm text-outline">{idx + 1}</td>
                            <td className="py-1 px-space-sm font-semibold text-on-surface capitalize">
                              {item.provider}
                            </td>
                            <td className="py-1 px-space-sm font-mono text-primary">
                              {item.masked}
                            </td>
                            <td className="py-1 px-space-sm text-on-surface-variant">
                              {item.tier || 'standard'}
                            </td>
                            <td className="py-1 px-space-sm text-secondary font-mono">
                              #{item.priority}
                            </td>
                            <td className="py-1 px-space-sm font-mono text-[11px]">
                              {item.remainingQuota !== null && item.remainingQuota !== undefined ? (
                                <span className={item.remainingQuota === 0 ? 'text-error font-bold' : 'text-primary'}>
                                  {item.remainingQuota.toLocaleString()} / {(item.quotaLimit ?? 0).toLocaleString()}
                                </span>
                              ) : item.quotaLimit ? (
                                <span className="text-outline">Max: {item.quotaLimit.toLocaleString()}</span>
                              ) : (
                                <span className="text-outline">Auto</span>
                              )}
                            </td>
                            <td className="py-1 px-space-sm">
                              {item.validationStatus === 'validating' && (
                                <span className="text-secondary flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                  Checking...
                                </span>
                              )}
                              {item.validationStatus === 'valid' && (
                                <span className="text-primary flex items-center gap-1 font-semibold">
                                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                  {item.validationDetail || 'Valid'}
                                </span>
                              )}
                              {item.validationStatus === 'invalid' && (
                                <span className="text-error flex items-center gap-1" title={item.validationDetail}>
                                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                                  Invalid
                                </span>
                              )}
                              {item.validationStatus === 'untested' && (
                                <span className="text-outline">Unverified</span>
                              )}
                            </td>
                            <td className="py-1 px-space-xs text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveBatchItem(item.id)}
                                className="text-outline hover:text-error p-0.5 cursor-pointer"
                                title="Remove this key from batch"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= SINGLE / ROTATE VIEW ======================= */}
          {mode !== 'batch' && (
            <>
              {/* Provider Selection */}
              <div className="flex flex-col gap-space-xs">
                <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                  Provider Engine
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-xs">
                  {providers.map((p) => (
                    <label
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={`flex items-center gap-space-xs p-space-xs rounded-lg border cursor-pointer transition-colors ${
                        provider === p.id
                          ? 'bg-surface-container-high border-primary text-on-surface shadow-sm'
                          : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modal-provider"
                        value={p.id}
                        checked={provider === p.id}
                        onChange={() => setProvider(p.id)}
                        className="accent-primary sr-only"
                      />
                      <span className={`material-symbols-outlined text-[18px] ${p.tone}`}>{p.icon}</span>
                      <span className="font-label-mono-sm text-label-mono-sm font-medium">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rotation Target (Visible if mode === 'rotate') */}
              {mode === 'rotate' && (
                <div className="flex flex-col gap-space-xs p-space-sm rounded-lg bg-surface-container border border-outline-variant/30">
                  <div className="flex items-center justify-between">
                    <label className="font-code-dense text-code-dense text-tertiary uppercase tracking-wider flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[14px]">sync</span> Target Key to Replace (Hot-Swap)
                    </label>
                    <span className="font-code-dense text-code-dense text-outline">Zero-downtime drain</span>
                  </div>
                  <select
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary"
                  >
                    {existingKeys.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.maskedKey} ({k.provider} · {k.tier || 'default'} · {k.status})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-space-xs mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetQuota}
                      onChange={(e) => setResetQuota(e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="font-code-dense text-code-dense text-on-surface-variant">
                      Reset quota usage and reactivate key immediately
                    </span>
                  </label>
                </div>
              )}

              {/* Profile / Tier & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Profile / Tier Label
                  </label>
                  <input
                    type="text"
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    placeholder="e.g. pro, free, tier-4"
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Priority Rank (Higher = preferred)
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-code-dense text-code-dense text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* Secret Key Input */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Secret API Key Token
                  </label>
                  <span className="font-code-dense text-code-dense text-primary flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Encrypted with AES-256
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyToken}
                    onChange={(e) => setKeyToken(e.target.value)}
                    placeholder="Paste full provider key string or local URL..."
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-code-dense text-code-dense text-on-surface pr-10 focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 text-outline hover:text-on-surface transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showKey ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Quota Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                      Hard Quota Limit (Tokens/Chars)
                    </label>
                    <span className="text-[10px] text-primary">
                      Auto-terisi via Validate
                    </span>
                  </div>
                  <input
                    type="number"
                    value={quotaLimit}
                    onChange={(e) => setQuotaLimit(e.target.value)}
                    placeholder="Auto-detected saat Validasi (opsional ubah)"
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                    Initial State
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="active">Active (Immediately routeable)</option>
                    <option value="disabled">Disabled / Staged</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Actions Bar */}
          <div className="flex items-center justify-between pt-space-md border-t border-outline-variant/30">
            <button
              type="button"
              onClick={onClose}
              className="px-space-md py-space-xs rounded-lg font-label-mono-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-space-sm">
              {mode === 'batch' ? (
                <>
                  <button
                    type="button"
                    onClick={handleValidateBatch}
                    disabled={validating || parsedItems.length === 0}
                    className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-container-high border border-outline-variant/40 font-label-mono-sm text-on-surface hover:bg-surface-bright transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[16px] text-secondary ${validating ? 'animate-spin' : ''}`}>
                      speed
                    </span>
                    <span>{validating ? 'Validating Batch...' : `Validate All (${parsedItems.length})`}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loading || parsedItems.length === 0}
                    className="flex items-center gap-space-xs px-space-lg py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">dynamic_feed</span>
                    <span>{loading ? 'Ingesting...' : `Import & Inject All (${parsedItems.length})`}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleValidateSingle}
                    disabled={validating}
                    className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-container-high border border-outline-variant/40 font-label-mono-sm text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[16px] text-secondary ${validating ? 'animate-spin' : ''}`}>
                      speed
                    </span>
                    <span>{validating ? 'Validating...' : 'Validate Key'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-space-xs px-space-lg py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">key</span>
                    <span>{loading ? 'Saving...' : 'Save & Inject to Pool'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
