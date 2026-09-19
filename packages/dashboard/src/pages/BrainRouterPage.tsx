import { useState, useEffect, Fragment, type FC } from 'react';
import { type BrainConfig, type BrainRoute, type DashboardSnapshot, apiRequest, apiUrl, labelForProvider, providerIcons } from '../api';

interface BrainRouterPageProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
}

export const BrainRouterPage: FC<BrainRouterPageProps> = ({ snapshot, onRefresh }) => {
  const [config, setConfig] = useState<BrainConfig>(snapshot.brainConfig);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [testPrompt, setTestPrompt] = useState<string>('Halo Neuro! Coba kenalkan dirimu dan apa saja yang bisa kamu lakukan.');
  const [testResult, setTestResult] = useState<{ text: string; provider?: string; model?: string; latencyMs?: number; tokens?: number } | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [enableTts, setEnableTts] = useState<boolean>(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [synthesizingTts, setSynthesizingTts] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState<boolean>(true);

  useEffect(() => {
    if (!isDirty) {
      setConfig(snapshot.brainConfig);
    }
  }, [snapshot.brainConfig, isDirty]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleUpdateRoute = (index: number, patch: Partial<BrainRoute>) => {
    setIsDirty(true);
    setConfig((prev) => {
      const nextCascade = prev.cascade.map((route, i) => (i === index ? { ...route, ...patch } : route));
      const targetRoute = nextCascade[index];
      const nextActiveModel =
        targetRoute && targetRoute.provider === prev.activeProvider && patch.model !== undefined
          ? patch.model
          : prev.activeModel;

      return {
        ...prev,
        activeModel: nextActiveModel,
        cascade: nextCascade
      };
    });
  };

  const handleUpdateActiveModel = (model: string) => {
    setIsDirty(true);
    setConfig((prev) => ({
      ...prev,
      activeModel: model,
      cascade: prev.cascade.map((r) => (r.provider === prev.activeProvider ? { ...r, model } : r))
    }));
  };

  const handleSelectActiveProvider = (prov: string) => {
    setIsDirty(true);
    const matched = config.cascade.find((c) => c.provider === prov);
    setConfig((prev) => ({
      ...prev,
      activeProvider: prov,
      activeModel: matched?.model || prev.activeModel
    }));
  };

  const handleUpdateSystemPrompt = (prompt: string) => {
    setIsDirty(true);
    setConfig((prev) => ({
      ...prev,
      systemPrompt: prompt
    }));
  };

  const handleDiscard = () => {
    setConfig(snapshot.brainConfig);
    setIsDirty(false);
    showToast('Reverted unsaved changes to saved matrix.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiRequest<BrainConfig>('/api/brain', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      setConfig(updated);
      setIsDirty(false);
      showToast('Brain cascade configuration saved to SQLite database.');
      onRefresh();
    } catch (err: any) {
      showToast(`Error saving config: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSpeakText = async (text: string) => {
    if (!text.trim()) return;
    setSynthesizingTts(true);
    try {
      const response = await fetch(apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        const errDetail = await response.text();
        showToast(`ElevenLabs TTS Error: ${errDetail || response.statusText}`);
      } else {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        showToast(`ElevenLabs speech generated (${Math.round(blob.size / 1024)} KB) · Playing!`);
      }
    } catch (err: any) {
      showToast(`TTS generation failed: ${err.message}`);
    } finally {
      setSynthesizingTts(false);
    }
  };

  const handleTestRoute = async () => {
    setTesting(true);
    setTestResult(null);
    setAudioUrl(null);
    const startTime = Date.now();
    try {
      const res = await apiRequest<{ content: string; provider?: string; model?: string; usage?: { totalTokens: number } }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          provider: config.activeProvider,
          model: config.activeModel,
          message: testPrompt,
          temperature: config.temperature,
          maxTokens: config.maxTokens
        })
      });
      const latency = Date.now() - startTime;
      setTestResult({
        text: res.content,
        provider: res.provider || config.activeProvider,
        model: res.model || config.activeModel,
        latencyMs: latency,
        tokens: res.usage?.totalTokens
      });
      showToast(`AI responded in ${latency}ms via ${labelForProvider(res.provider || config.activeProvider)}`);
      onRefresh();

      if (enableTts && res.content) {
        await handleSpeakText(res.content);
      }
    } catch (err: any) {
      setTestResult({
        text: `Route test failed: ${err.message}`,
        provider: config.activeProvider,
        model: config.activeModel,
        latencyMs: Date.now() - startTime
      });
      showToast(`Error testing route: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleFlushCache = () => {
    showToast('Global Provider Cache purged across all inference workers.');
  };

  return (
    <div className="flex flex-col w-full gap-space-md py-space-sm pb-space-xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-space-xs pointer-events-none animate-in fade-in slide-in-from-bottom-2">
          <div className="px-space-md py-space-xs rounded-lg bg-surface-container-highest text-on-surface font-label-mono-sm shadow-xl flex items-center gap-space-xs border border-primary/30">
            <span className="material-symbols-outlined text-primary text-[16px]">info</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header & Command Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md py-space-sm">
        <div>
          <div className="flex items-center gap-space-sm">
            <span className="font-code-dense text-code-dense text-primary uppercase px-space-xs py-0.5 rounded bg-surface-container-high font-semibold">
              ORCHESTRATOR_ROUTER_V2
            </span>
            <span className="text-outline text-code-dense font-code-dense">/</span>
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              CASCADE_MATRIX
            </span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
            Brain Router &amp; Fallback Cascade Pipeline
          </h1>
        </div>

        <div className="flex items-center flex-wrap gap-space-xs">
          {isDirty && (
            <span className="flex items-center gap-1.5 px-space-sm py-1 rounded-lg bg-tertiary/10 border border-tertiary/30 text-tertiary font-code-dense text-code-dense font-semibold">
              <span className="h-2 w-2 rounded-full bg-tertiary animate-ping" />
              UNSAVED CHANGES
            </span>
          )}
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors font-label-mono-sm border border-outline-variant/30 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">undo</span>
              <span>Discard</span>
            </button>
          )}
          <button
            onClick={handleFlushCache}
            className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors font-label-mono-sm border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">cached</span>
            <span>Flush Cache</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-space-xs px-space-lg py-space-xs rounded-lg font-label-mono-sm font-semibold transition-all shadow-sm cursor-pointer ${
              isDirty
                ? 'bg-tertiary text-on-tertiary hover:bg-tertiary-fixed-dim ring-2 ring-tertiary/40'
                : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>{saving ? 'Saving...' : isDirty ? 'Save Matrix *' : 'Save Matrix'}</span>
          </button>
        </div>
      </div>

      {/* Primary Target & Hyperparameters Card */}
      <section className="w-full bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-md border border-outline-variant/30">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-center">
          {/* Active Provider Selector */}
          <div className="lg:col-span-4 flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
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
            <select
              value={config.activeProvider}
              onChange={(e) => handleSelectActiveProvider(e.target.value)}
              className="w-full bg-surface-container-high text-on-surface font-label-mono-md text-label-mono-md py-space-xs px-space-sm rounded-lg appearance-none cursor-pointer focus:outline-none focus:bg-surface-bright transition-colors border border-outline-variant/20"
            >
              {config.cascade.map((c) => (
                <option key={c.provider} value={c.provider}>
                  {labelForProvider(c.provider)} ({c.model})
                </option>
              ))}
            </select>
          </div>

          {/* Active Model Name Input */}
          <div className="lg:col-span-4 flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
            <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
              ACTIVE MODEL IDENTIFIER
            </span>
            <input
              type="text"
              value={config.activeModel}
              onChange={(e) => handleUpdateActiveModel(e.target.value)}
              className="bg-surface-container-high text-on-surface font-label-mono-sm text-label-mono-sm py-space-xs px-space-sm rounded-lg focus:outline-none focus:bg-surface-bright border border-outline-variant/20 font-mono"
            />
          </div>

          {/* Max Tokens & Failover Switch */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-space-sm">
            <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">MAX TOKENS</span>
              <input
                type="number"
                value={config.maxTokens}
                onChange={(e) => {
                  setIsDirty(true);
                  setConfig((prev) => ({ ...prev, maxTokens: Number(e.target.value) }));
                }}
                className="bg-surface-container-high text-on-surface font-label-mono-sm py-space-xs px-space-sm rounded-lg focus:outline-none border border-outline-variant/20 font-mono"
              />
            </div>
            <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20 justify-between">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">AUTO FAILOVER</span>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={config.autoFailover}
                  onChange={(e) => {
                    setIsDirty(true);
                    setConfig((prev) => ({ ...prev, autoFailover: e.target.checked }));
                  }}
                  className="accent-primary h-4 w-4"
                />
                <span className="font-label-mono-sm text-primary font-semibold">
                  {config.autoFailover ? 'ENABLED' : 'DISABLED'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Visual Fallback Pipeline Sequence Chips */}
        <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg border border-outline-variant/20">
          <div className="flex items-center justify-between mb-1">
            <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
              CASCADE PIPELINE ORDER (AUTOMATIC HOP DEGRADATION)
            </span>
            <span className="font-code-dense text-code-dense text-primary font-semibold">
              {config.cascade.filter((c) => c.enabled).length} NODES ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-space-xs overflow-x-auto py-1">
            {config.cascade.map((route, idx) => (
              <Fragment key={route.provider}>
                <div
                  className={`flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg shrink-0 shadow-sm border transition-all ${
                    route.enabled
                      ? 'bg-surface-container-high border-primary/40'
                      : 'bg-surface-container border-outline-variant/20 opacity-50'
                  }`}
                >
                  <span
                    className={`font-code-dense text-code-dense px-1.5 py-0.2 rounded font-bold ${
                      idx === 0 ? 'bg-primary text-on-primary' : 'bg-surface-bright text-on-surface'
                    }`}
                  >
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold">
                      {labelForProvider(route.provider)}
                    </span>
                    <span className="font-code-dense text-code-dense text-outline truncate max-w-[120px]">
                      {route.model}
                    </span>
                  </div>
                </div>
                {idx < config.cascade.length - 1 && (
                  <span className="material-symbols-outlined text-outline text-[14px] shrink-0">arrow_forward</span>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Live Cascade Pipeline Topology Cards */}
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">account_tree</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Live Cascade Pipeline Topology (Node Controls)
            </h2>
          </div>
          <span className="font-code-dense text-code-dense text-outline">
            Drag handles &amp; sliders to tune traffic splits
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-space-sm">
          {config.cascade.map((route, idx) => {
            const isPrimary = idx === 0;
            const topBarColor = isPrimary ? 'bg-primary' : idx === 1 ? 'bg-secondary' : 'bg-tertiary';

            return (
              <div
                key={route.provider}
                className="flex flex-col justify-between p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-all relative overflow-hidden group shadow-md border border-outline-variant/30"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${topBarColor}`} />
                <div className="flex flex-col gap-space-sm">
                  {/* Top Node Pill */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-outline text-[16px] cursor-grab">
                        drag_indicator
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-code-dense text-code-dense text-primary font-bold">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-code-dense text-code-dense uppercase font-semibold">
                        {isPrimary ? 'PRIMARY' : 'STANDBY'}
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={route.enabled}
                        onChange={(e) => handleUpdateRoute(idx, { enabled: e.target.checked })}
                        className="accent-primary h-4 w-4"
                      />
                    </label>
                  </div>

                  {/* Provider & Model */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        {providerIcons[route.provider] || 'api'}
                      </span>
                      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                        {labelForProvider(route.provider)}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={route.model}
                      onChange={(e) => handleUpdateRoute(idx, { model: e.target.value })}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded px-1.5 py-0.5 font-code-dense text-code-dense text-on-surface-variant font-mono mt-1 focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Health Stats */}
                  <div className="grid grid-cols-2 gap-space-xs py-space-xs bg-surface-container-lowest rounded-lg px-space-sm text-on-surface-variant font-code-dense text-code-dense">
                    <div>
                      <span className="block text-outline">PRIORITY</span>
                      <span className="text-primary font-bold">#{route.priority}</span>
                    </div>
                    <div>
                      <span className="block text-outline">TIMEOUT</span>
                      <span className="text-on-surface font-mono">{route.timeoutMs}ms</span>
                    </div>
                  </div>

                  {/* Weight Split Slider */}
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex justify-between items-center text-on-surface-variant font-code-dense text-code-dense">
                      <span>WEIGHT SPLIT</span>
                      <span className="text-primary font-bold">{route.weight}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={route.weight}
                      onChange={(e) => handleUpdateRoute(idx, { weight: Number(e.target.value) })}
                      className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Timeout Threshold Slider */}
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex justify-between items-center text-on-surface-variant font-code-dense text-code-dense">
                      <span>TIMEOUT CAP</span>
                      <span className="text-on-surface font-mono">{route.timeoutMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="1000"
                      max="60000"
                      step="1000"
                      value={route.timeoutMs}
                      onChange={(e) => handleUpdateRoute(idx, { timeoutMs: Number(e.target.value) })}
                      className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>

                <div className="mt-space-sm pt-space-xs flex items-center justify-between text-outline font-code-dense text-code-dense border-t border-outline-variant/20">
                  <span>FALLBACK →</span>
                  <span className="text-secondary font-semibold">
                    {idx < config.cascade.length - 1 ? labelForProvider(config.cascade[idx + 1].provider) : 'DEAD-END'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* System Persona & Conversational Directives */}
      <section className="w-full bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm shadow-md border border-outline-variant/30">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPromptEditor(!showPromptEditor)}>
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">psychology_alt</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              System Persona &amp; ElevenLabs Conversational Directives
            </h2>
          </div>
          <div className="flex items-center gap-space-xs">
            <span className="font-code-dense text-code-dense text-primary font-semibold">
              {showPromptEditor ? 'COLLAPSE' : 'EXPAND'}
            </span>
            <span className="material-symbols-outlined text-primary text-[18px]">
              {showPromptEditor ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </div>

        {showPromptEditor && (
          <div className="flex flex-col gap-space-xs mt-1">
            <p className="font-code-dense text-code-dense text-on-surface-variant">
              Instruksi ini disisipkan otomatis sebagai <strong>System Prompt</strong> pada setiap giliran chat agar respon AI terasa seperti percakapan nyata (spontan, emosional, bervariasi) dan 100% siap disuarakan langsung oleh ElevenLabs tanpa naskah kaku.
            </p>
            <textarea
              rows={8}
              value={config.systemPrompt || ''}
              onChange={(e) => handleUpdateSystemPrompt(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-space-sm font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed"
              placeholder="Masukkan instruksi persona sistem di sini..."
            />
            <div className="flex items-center justify-between text-outline font-code-dense text-code-dense">
              <span>Rule #19 Aktif: Tanpa stage direction ([marah], *bisik*), tanpa analisis, hanya output dialog final untuk TTS.</span>
              <span>{(config.systemPrompt || '').length} karakter</span>
            </div>
          </div>
        )}
      </section>

      {/* Live Route Testing Console */}
      <section className="w-full bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm shadow-md border border-outline-variant/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-secondary text-[18px]">terminal</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Live Route Tester &amp; Response Console
            </h2>
          </div>
          <span className="font-code-dense text-code-dense text-outline">
            Test real round-trip LLM routing and token streams
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
          <div className="lg:col-span-6 flex flex-col gap-space-xs">
            <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
              Test Prompt
            </label>
            <textarea
              rows={3}
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-space-sm font-label-mono-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-secondary font-label-mono-sm">
                <input
                  type="checkbox"
                  checked={enableTts}
                  onChange={(e) => setEnableTts(e.target.checked)}
                  className="accent-secondary h-4 w-4 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">record_voice_over</span>
                  <span>Speak with ElevenLabs TTS</span>
                </span>
              </label>

              <button
                onClick={handleTestRoute}
                disabled={testing || synthesizingTts}
                className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${testing || synthesizingTts ? 'animate-spin' : ''}`}>
                  {testing ? 'psychology' : synthesizingTts ? 'record_voice_over' : 'send'}
                </span>
                <span>
                  {testing ? 'Brain Thinking...' : synthesizingTts ? 'Synthesizing Speech...' : enableTts ? 'Send & Speak' : 'Send Probe'}
                </span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-space-xs">
            <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
              Routing Output &amp; Voice Inspector
            </label>
            <div className="min-h-[140px] bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-space-sm flex flex-col justify-between font-code-dense text-code-dense text-on-surface">
              {testResult ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
                    <span className="text-primary font-bold uppercase flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      {labelForProvider(testResult.provider || '')} [{testResult.model}]
                    </span>
                    <div className="flex items-center gap-space-sm text-outline font-mono text-label-mono-sm">
                      {testResult.tokens !== undefined && <span>{testResult.tokens} tokens</span>}
                      <span className="text-secondary font-semibold">{testResult.latencyMs}ms</span>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed font-body-md text-on-surface select-text">
                    {testResult.text}
                  </p>

                  {/* Audio Player & Synthesizer State */}
                  {synthesizingTts && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center gap-2 text-secondary font-code-dense text-code-dense animate-pulse">
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      <span>ElevenLabs generating audio stream...</span>
                    </div>
                  )}

                  {audioUrl && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex flex-col gap-1.5 bg-surface-container/50 p-2 rounded-lg border border-secondary/20">
                      <div className="flex items-center justify-between text-secondary font-code-dense text-code-dense font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-secondary">volume_up</span>
                          <span>ElevenLabs Voice Output (Autoplay)</span>
                        </div>
                        <button
                          onClick={() => handleSpeakText(testResult.text)}
                          disabled={synthesizingTts}
                          className="text-on-surface-variant hover:text-secondary underline cursor-pointer text-code-dense"
                        >
                          Re-Synthesize
                        </button>
                      </div>
                      <audio controls autoPlay src={audioUrl} className="w-full h-8 accent-secondary" />
                    </div>
                  )}

                  {!audioUrl && !synthesizingTts && testResult.text && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex justify-end">
                      <button
                        onClick={() => handleSpeakText(testResult.text)}
                        className="flex items-center gap-1 px-space-sm py-0.5 rounded bg-surface-container-high hover:bg-surface-bright text-secondary font-label-mono-sm text-label-mono-sm transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">record_voice_over</span>
                        <span>Speak with ElevenLabs</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-outline my-auto text-center font-code-dense">
                  Ketik prompt di samping lalu klik "Send &amp; Speak" untuk menguji AI berpikir dan bersuara live via ElevenLabs.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
