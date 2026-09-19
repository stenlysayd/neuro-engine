import { useState, useMemo, Fragment, type FC } from 'react';
import { type DashboardSnapshot, type PublicApiKey, apiRequest, formatNumber, formatTimeAgo, labelForProvider, providerIcons } from '../api';
import { KeyModal } from '../components/modals/KeyModal';

interface KeyPoolsPageProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
}

export const KeyPoolsPage: FC<KeyPoolsPageProps> = ({ snapshot, onRefresh }) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'new' | 'batch' | 'rotate'>('new');
  const [targetKeyForRotate, setTargetKeyForRotate] = useState<PublicApiKey | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isSyncingQuotas, setIsSyncingQuotas] = useState<boolean>(false);

  const keys = snapshot.keys;
  const activeBrain = snapshot.telemetry.activeBrain;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSyncQuotas = async () => {
    setIsSyncingQuotas(true);
    showToast('Syncing real-time quotas directly from provider APIs...');
    try {
      const res = await apiRequest<{
        success: boolean;
        total: number;
        synced: number;
        exhausted: number;
        errors: number;
      }>('/api/keys/sync-quotas', {
        method: 'POST',
        body: JSON.stringify({
          provider: selectedProvider !== 'all' ? selectedProvider : undefined
        })
      });
      showToast(`Berhasil sync ${res.synced} keys (${res.exhausted} kuota habis, ${res.errors} error).`);
      onRefresh();
    } catch (err: any) {
      showToast(`Gagal sync kuota: ${err.message}`);
    } finally {
      setIsSyncingQuotas(false);
    }
  };

  const filteredKeys = useMemo(() => {
    if (selectedProvider === 'all') return keys;
    return keys.filter((k) => k.provider.toLowerCase() === selectedProvider.toLowerCase());
  }, [keys, selectedProvider]);

  const providerTabs = [
    { id: 'all', label: 'All Providers' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'elevenlabs', label: 'ElevenLabs' },
    { id: 'groq', label: 'Groq Cloud' },
    { id: 'google', label: 'Google AI' },
    { id: 'local', label: 'Local vLLM' },
  ];

  const handleCopyKey = (masked: string) => {
    navigator.clipboard.writeText(masked);
    showToast(`Copied key hash to clipboard: ${masked}`);
  };

  const handleToggleStatus = async (key: PublicApiKey) => {
    const nextStatus = key.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/api/keys/${key.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus })
      });
      showToast(`Key [${key.maskedKey}] status changed to ${nextStatus.toUpperCase()}`);
      onRefresh();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleResetQuota = async (key: PublicApiKey) => {
    try {
      await apiRequest(`/api/keys/${key.id}/reset-quota`, { method: 'POST' });
      showToast(`Quota reset for key [${key.maskedKey}]`);
      onRefresh();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleTestKey = async (key: PublicApiKey) => {
    setTestingKeyId(key.id);
    try {
      const res = await apiRequest<{
        ok?: boolean;
        success?: boolean;
        status?: number;
        latencyMs?: number;
        detail?: string;
        error?: string | null;
        tier?: string | null;
      }>(`/api/keys/${key.id}/validate`, {
        method: 'POST'
      });
      const isSuccess = Boolean(res.ok || res.success);
      if (isSuccess) {
        showToast(`Validated [${key.maskedKey}]: ${res.detail || 'OK 200'} (${res.latencyMs || 0}ms)`);
      } else {
        showToast(`Validation check [${key.maskedKey}]: Failed (${res.error || res.detail || 'invalid key'})`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(`Error validating key: ${err.message}`);
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleDeleteKey = async (key: PublicApiKey) => {
    if (!window.confirm(`Permanently remove key ${key.maskedKey} from pool?`)) return;
    try {
      await apiRequest(`/api/keys/${key.id}`, { method: 'DELETE' });
      showToast(`Key ${key.maskedKey} deleted from database.`);
      onRefresh();
    } catch (err: any) {
      showToast(`Error deleting key: ${err.message}`);
    }
  };

  const openRotateModal = (key: PublicApiKey) => {
    setTargetKeyForRotate(key);
    setModalMode('rotate');
    setModalOpen(true);
  };

  const openAddModal = () => {
    setTargetKeyForRotate(null);
    setModalMode('new');
    setModalOpen(true);
  };

  const openBatchModal = () => {
    setTargetKeyForRotate(null);
    setModalMode('batch');
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col w-full gap-space-md py-space-sm pb-space-xl">
      {/* Toast Notification Overlay */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-space-xs pointer-events-none animate-in fade-in slide-in-from-bottom-2">
          <div className="px-space-md py-space-xs rounded-lg bg-surface-container-highest text-on-surface font-label-mono-sm shadow-xl flex items-center gap-space-xs border border-primary/30">
            <span className="material-symbols-outlined text-primary text-[16px]">info</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Top Section: Active Brain Control & Fallback Routing */}
      <section className="w-full bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-md border border-outline-variant/30">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <div className="h-6 w-6 rounded-lg bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[16px]">neurology</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight font-bold">
                Active Brain Control &amp; Fallback Routing
              </h2>
              <span className="font-code-dense text-code-dense text-outline tracking-wider uppercase">
                Orchestrator Topology: Dynamic Failover Matrix
              </span>
            </div>
          </div>

          {/* Quick Route Performance Badges & Controls */}
          <div className="flex items-center flex-wrap gap-space-xs">
            <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-lowest rounded-lg border border-outline-variant/20">
              <span className="font-code-dense text-code-dense text-outline uppercase">P95 ROUTE:</span>
              <span className="font-label-mono-sm text-label-mono-sm text-secondary font-semibold">
                {snapshot.telemetry.usage.avgLatency}ms
              </span>
            </div>
            <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-lowest rounded-lg border border-outline-variant/20">
              <span className="font-code-dense text-code-dense text-outline uppercase">THRESHOLD:</span>
              <span className="font-label-mono-sm text-label-mono-sm text-tertiary font-semibold">3 Retries</span>
            </div>
            <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-lowest rounded-lg border border-outline-variant/20">
              <span className="font-code-dense text-code-dense text-on-surface-variant uppercase">AUTO-FAILOVER:</span>
              <span className="font-label-mono-sm text-label-mono-sm text-primary font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-lowest rounded-lg border border-outline-variant/20">
              <span className="font-code-dense text-code-dense text-outline uppercase">VOICE ESTAFET:</span>
              <span className="font-label-mono-sm text-label-mono-sm text-secondary font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-secondary">record_voice_over</span>
                {keys.filter(k => k.provider === 'elevenlabs' && k.status === 'active').length} Workers Ready
              </span>
            </div>
            <button
              onClick={handleSyncQuotas}
              disabled={isSyncingQuotas}
              className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-surface-container-high border border-primary/40 text-primary font-label-mono-sm font-semibold hover:bg-surface-bright transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              title="Ambil sisa kuota real-time langsung dari API provider (tanpa ketik manual)"
            >
              <span className={`material-symbols-outlined text-primary text-[16px] ${isSyncingQuotas ? 'animate-spin' : ''}`}>
                cloud_sync
              </span>
              <span>{isSyncingQuotas ? 'Syncing...' : '⚡ Sync Live Quotas'}</span>
            </button>
            <button
              onClick={openBatchModal}
              className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface font-label-mono-sm font-semibold hover:bg-surface-bright transition-colors shadow-sm cursor-pointer"
              title="Import multiple API keys at once"
            >
              <span className="material-symbols-outlined text-secondary text-[16px]">dynamic_feed</span>
              <span>Batch Import</span>
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Key</span>
            </button>
          </div>
        </div>

        {/* Primary Brain Selector & Fallback Order Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-sm items-center">
          <div className="lg:col-span-4 flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                PRIMARY TARGET CORE
              </span>
              <div className="flex items-center gap-space-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="font-code-dense text-code-dense text-primary font-semibold">HEALTHY · LIVE</span>
              </div>
            </div>
            <div className="font-label-mono-md text-label-mono-md text-on-surface font-semibold py-1">
              {labelForProvider(activeBrain.provider)} — {activeBrain.model}
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider">
                FALLBACK CASCADE PIPELINE (AUTOMATIC EXPONENTIAL DEGRADATION)
              </span>
              <span className="font-code-dense text-code-dense text-on-surface-variant font-semibold">
                CASCADE: {snapshot.brainConfig.cascade.length} HOPS
              </span>
            </div>
            <div className="flex items-center gap-space-xs overflow-x-auto py-0.5">
              {snapshot.brainConfig.cascade.map((route, idx) => (
                <Fragment key={route.provider}>
                  <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-surface-container-high shrink-0 shadow-sm border border-outline-variant/20">
                    <span className="font-code-dense text-code-dense px-1 py-0.2 rounded bg-primary text-on-primary font-semibold">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold">
                        {labelForProvider(route.provider)}
                      </span>
                      <span className="font-code-dense text-code-dense text-primary">{route.model}</span>
                    </div>
                  </div>
                  {idx < snapshot.brainConfig.cascade.length - 1 && (
                    <span className="material-symbols-outlined text-outline text-[14px] shrink-0">
                      arrow_forward
                    </span>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Provider Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-space-xs p-space-xs bg-surface-container-low rounded-xl border border-outline-variant/30">
        <div className="flex items-center flex-wrap gap-space-xs">
          {providerTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedProvider(tab.id)}
              className={`px-space-sm py-space-xs rounded-lg font-label-mono-sm text-label-mono-sm transition-colors cursor-pointer ${
                selectedProvider === tab.id
                  ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-space-sm text-outline font-code-dense text-code-dense">
          Showing {filteredKeys.length} of {keys.length} API Keys
        </div>
      </div>

      {/* High-Density Key Pool Table */}
      <section className="w-full bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-code-dense text-code-dense border-collapse">
            <thead className="bg-surface-container-high/80 text-outline uppercase border-b border-outline-variant/30">
              <tr>
                <th className="py-space-xs px-space-md">Provider</th>
                <th className="py-space-xs px-space-md">Tier</th>
                <th className="py-space-xs px-space-md">Masked Key Hash</th>
                <th className="py-space-xs px-space-md">Pool Status</th>
                <th className="py-space-xs px-space-md min-w-[200px]">Quota Utilization</th>
                <th className="py-space-xs px-space-md">Priority</th>
                <th className="py-space-xs px-space-md">Last Used</th>
                <th className="py-space-xs px-space-md text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredKeys.map((key) => {
                const percent = key.usagePercent ?? 0;
                const isTesting = testingKeyId === key.id;

                const statusBadgeStyle: Record<string, string> = {
                  active: 'bg-primary/10 text-primary border-primary/25',
                  exhausted: 'bg-tertiary/10 text-tertiary border-tertiary/25',
                  error: 'bg-error/10 text-error border-error/25',
                  disabled: 'bg-outline/10 text-outline border-outline/25'
                };

                return (
                  <tr key={key.id} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-space-sm px-space-md font-label-mono-sm text-label-mono-sm">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-primary text-[18px]">
                          {providerIcons[key.provider] || 'api'}
                        </span>
                        <span className="font-semibold text-on-surface">{labelForProvider(key.provider)}</span>
                      </div>
                    </td>
                    <td className="py-space-sm px-space-md text-on-surface-variant font-label-mono-sm">
                      {key.tier || 'standard'}
                    </td>
                    <td className="py-space-sm px-space-md font-mono text-on-surface">
                      <div className="flex items-center gap-space-xs">
                        <span className="bg-surface-container-lowest px-1.5 py-0.5 rounded border border-outline-variant/20">
                          {key.maskedKey}
                        </span>
                        <button
                          onClick={() => handleCopyKey(key.maskedKey)}
                          className="text-outline hover:text-on-surface transition-colors cursor-pointer"
                          title="Copy Masked Hash"
                        >
                          <span className="material-symbols-outlined text-[14px]">content_copy</span>
                        </button>
                      </div>
                    </td>
                    <td className="py-space-sm px-space-md">
                      {key.is_locked ? (
                        <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded border border-primary/40 bg-primary/20 text-primary font-code-dense text-code-dense uppercase font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                          <span>⚡ In Use</span>
                        </span>
                      ) : key.status === 'exhausted' ? (
                        key.quota_reset_at ? (
                          <span
                            className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded border border-tertiary/40 bg-tertiary/10 text-tertiary font-code-dense text-code-dense font-semibold"
                            title={key.last_error || `Istirahat sampai ${new Date(key.quota_reset_at).toLocaleString()}`}
                          >
                            <span className="material-symbols-outlined text-[13px]">bedtime</span>
                            <span>Istirahat (Reset)</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded border border-error/40 bg-error/15 text-error font-code-dense text-code-dense font-semibold"
                            title={key.last_error || 'Kuota sudah habis permanen, ganti ke API key baru'}
                          >
                            <span className="material-symbols-outlined text-[13px]">warning</span>
                            <span>Ganti ke API Baru</span>
                          </span>
                        )
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-space-xs py-0.5 rounded border font-code-dense text-code-dense uppercase font-semibold ${
                            statusBadgeStyle[key.status] || statusBadgeStyle.active
                          }`}
                          title={key.last_error || undefined}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              key.status === 'active'
                                ? 'bg-primary animate-pulse'
                                : key.status === 'error'
                                ? 'bg-error'
                                : 'bg-outline'
                            }`}
                          />
                          {key.status}
                        </span>
                      )}
                    </td>
                    <td className="py-space-sm px-space-md min-w-[220px]">
                      {key.quota_limit !== null ? (
                        <>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1 font-mono">
                              {key.remainingQuota !== null && key.remainingQuota > 0 ? (
                                <span className="font-bold text-primary flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-primary">data_usage</span>
                                  Sisa: {formatNumber(key.remainingQuota)}
                                </span>
                              ) : (
                                <span className="font-bold text-error flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-error">cancel</span>
                                  Sisa: 0 (Habis)
                                </span>
                              )}
                            </div>
                            <span
                              className={`font-mono text-[11px] px-1 rounded ${
                                percent >= 100
                                  ? 'bg-error/20 text-error font-bold'
                                  : percent > 85
                                  ? 'bg-tertiary/20 text-tertiary font-bold'
                                  : 'text-outline'
                              }`}
                            >
                              {percent}% terpakai
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden mb-1">
                            <div
                              className={`h-full transition-all duration-300 ${
                                percent >= 100 ? 'bg-error' : percent > 85 ? 'bg-tertiary' : 'bg-primary'
                              }`}
                              style={{ width: `${Math.min(100, percent)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-outline">
                            <span>
                              {formatNumber(key.quota_used)} / {formatNumber(key.quota_limit)} chars
                            </span>
                            {key.quota_reset_at && (
                              <span
                                className="text-secondary hover:underline cursor-help truncate max-w-[120px]"
                                title={`Reset: ${new Date(key.quota_reset_at).toLocaleString()}`}
                              >
                                Reset: {new Date(key.quota_reset_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col gap-0.5 font-mono">
                          <div className="flex items-center justify-between">
                            <span className="text-on-surface-variant font-medium">Sisa: ∞ (Unlimited)</span>
                            <span className="text-outline text-[11px]">Terpakai: {formatNumber(key.quota_used)}</span>
                          </div>
                          <span className="text-[10px] text-outline">Klik Ping/Sync untuk ambil kuota real-time</span>
                        </div>
                      )}
                    </td>
                    <td className="py-space-sm px-space-md font-mono text-on-surface-variant font-semibold">
                      #{key.priority}
                    </td>
                    <td className="py-space-sm px-space-md text-on-surface-variant">
                      {formatTimeAgo(key.last_used_at)}
                    </td>
                    <td className="py-space-sm px-space-md text-right">
                      <div className="flex items-center justify-end gap-space-xs">
                        <button
                          onClick={() => handleTestKey(key)}
                          disabled={isTesting}
                          className="h-7 w-7 rounded bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors cursor-pointer"
                          title="Validate Key"
                        >
                          <span className={`material-symbols-outlined text-[15px] ${isTesting ? 'animate-spin' : ''}`}>
                            network_ping
                          </span>
                        </button>
                        <button
                          onClick={() => handleResetQuota(key)}
                          className="h-7 w-7 rounded bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                          title="Reset Usage Quota"
                        >
                          <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                        </button>
                        <button
                          onClick={() => openRotateModal(key)}
                          className="h-7 w-7 rounded bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-tertiary transition-colors cursor-pointer"
                          title="Hot-Swap / Rotate Key"
                        >
                          <span className="material-symbols-outlined text-[15px]">sync_lock</span>
                        </button>
                        <button
                          onClick={() => handleToggleStatus(key)}
                          className={`h-7 w-7 rounded bg-surface-container-high hover:bg-surface-bright flex items-center justify-center transition-colors cursor-pointer ${
                            key.status === 'active' ? 'text-primary' : 'text-outline'
                          }`}
                          title={key.status === 'active' ? 'Disable Key' : 'Enable Key'}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {key.status === 'active' ? 'toggle_on' : 'toggle_off'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteKey(key)}
                          className="h-7 w-7 rounded bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-error transition-colors cursor-pointer"
                          title="Delete Key"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredKeys.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-space-xl text-center text-outline">
                    No keys found for this provider filter. Click "Add Key" to register one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal */}
      {modalOpen && (
        <KeyModal
          initialMode={modalMode}
          targetKey={targetKeyForRotate}
          existingKeys={keys}
          onClose={() => setModalOpen(false)}
          onSaved={(msg) => {
            showToast(msg);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
