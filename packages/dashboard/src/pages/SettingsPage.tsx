import { useState, useEffect, type FC } from 'react';
import { type DashboardSnapshot, type OpsConfig, type TTSConfig, apiRequest, apiUrl } from '../api';

interface SettingsPageProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
}

export const SettingsPage: FC<SettingsPageProps> = ({ snapshot, onRefresh }) => {
  const [ops, setOps] = useState<OpsConfig>(snapshot.opsConfig);
  const [tts, setTts] = useState<TTSConfig>(snapshot.ttsConfig);
  const [testText, setTestText] = useState<string>('Hello! This is a real-time speech synthesis test from ElevenLabs.');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [testingTts, setTestingTts] = useState<boolean>(false);
  const [savingOps, setSavingOps] = useState<boolean>(false);
  const [savingTts, setSavingTts] = useState<boolean>(false);
  const [isDirtyOps, setIsDirtyOps] = useState<boolean>(false);
  const [isDirtyTts, setIsDirtyTts] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirtyOps) {
      setOps(snapshot.opsConfig);
    }
    if (!isDirtyTts) {
      setTts(snapshot.ttsConfig);
    }
  }, [snapshot.opsConfig, snapshot.ttsConfig, isDirtyOps, isDirtyTts]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveOps = async () => {
    setSavingOps(true);
    try {
      const updated = await apiRequest<OpsConfig>('/api/settings/ops', {
        method: 'PUT',
        body: JSON.stringify(ops)
      });
      setOps(updated);
      setIsDirtyOps(false);
      showToast('Ops configuration updated and persisted.');
      onRefresh();
    } catch (err: any) {
      showToast(`Error saving ops settings: ${err.message}`);
    } finally {
      setSavingOps(false);
    }
  };

  const handleSaveTts = async () => {
    setSavingTts(true);
    try {
      const updated = await apiRequest<TTSConfig>('/api/tts/config', {
        method: 'PUT',
        body: JSON.stringify(tts)
      });
      setTts(updated);
      setIsDirtyTts(false);
      showToast('ElevenLabs TTS configuration updated.');
      onRefresh();
    } catch (err: any) {
      showToast(`Error saving TTS settings: ${err.message}`);
    } finally {
      setSavingTts(false);
    }
  };

  const handleTestTts = async () => {
    setTestingTts(true);
    showToast('Synthesizing speech via ElevenLabs multi-key router...');
    try {
      const response = await fetch(apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          voiceId: tts.defaultVoiceId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      showToast(`TTS Audio generated successfully (${Math.round(blob.size / 1024)} KB)!`);
      onRefresh();
    } catch (err: any) {
      showToast(`TTS Error: ${err.message}`);
    } finally {
      setTestingTts(false);
    }
  };

  const handleMaintenance = async (action: 'vacuum' | 'clear-cache' | 'reset-exhausted') => {
    try {
      await apiRequest('/api/ops/maintenance', {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      showToast(`Maintenance action completed: ${action}`);
      onRefresh();
    } catch (err: any) {
      showToast(`Maintenance error: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col w-full gap-space-xl py-space-sm pb-space-xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-space-xs pointer-events-none animate-in fade-in slide-in-from-bottom-2">
          <div className="px-space-md py-space-xs rounded-lg bg-surface-container-highest text-on-surface font-label-mono-sm shadow-xl flex items-center gap-space-xs border border-primary/30">
            <span className="material-symbols-outlined text-primary text-[16px]">info</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Cluster State Banner & Command Strip */}
      <div className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md bg-surface-container-low p-space-lg rounded-xl shadow-md border border-outline-variant/30">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm">
              <span className="px-space-xs py-0.5 rounded bg-primary-container/20 text-primary font-code-dense text-code-dense uppercase tracking-wider font-semibold">
                CONFIG SYNC: ACTIVE
              </span>
              <span className="text-on-surface-variant font-code-dense text-code-dense">
                HASH: <span className="text-on-surface font-semibold font-mono">9f2e...849c</span>
              </span>
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            </div>
            <h1 className="font-headline-md text-headline-md text-on-surface font-bold">
              Ops Settings &amp; Cluster Configuration
            </h1>
            <p className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
              Cluster ID: <span className="text-primary font-semibold font-mono">{ops.clusterId}</span> •
              Runtime: <span className="text-secondary font-semibold font-mono">Neuro-Core v1.0.0</span> •
              Environment: <span className="text-tertiary font-semibold font-mono">{ops.environment}</span>
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-space-sm">
            <button
              onClick={() => handleMaintenance('vacuum')}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container text-on-surface font-label-mono-md text-label-mono-md shadow-sm transition-all border border-outline-variant/30 cursor-pointer"
            >
              <span className="material-symbols-outlined text-secondary text-[16px]">database</span>
              <span>VACUUM SQLite</span>
            </button>
            <button
              onClick={handleSaveOps}
              disabled={savingOps}
              className="flex items-center gap-space-xs px-space-lg py-space-sm rounded-lg bg-primary hover:bg-primary-fixed text-on-primary font-label-mono-md text-label-mono-md font-semibold shadow-md transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>{savingOps ? 'Saving...' : 'Save Ops Settings'}</span>
            </button>
          </div>
        </div>

        {/* Telemetry Diagnostic Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
          <div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col justify-between shadow-sm border border-outline-variant/20">
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              ROUTING ENGINE
            </span>
            <div className="flex items-baseline justify-between mt-space-xs">
              <span className="font-label-mono-lg text-label-mono-lg text-on-surface font-semibold font-mono">
                Neuro-Brain
              </span>
              <span className="font-code-dense text-code-dense text-primary font-mono">0.12ms ovh</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col justify-between shadow-sm border border-outline-variant/20">
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              CIRCUIT BREAKER
            </span>
            <div className="flex items-baseline justify-between mt-space-xs">
              <span className="font-label-mono-lg text-label-mono-lg text-primary font-semibold font-mono">
                ALL CLOSED (NORMAL)
              </span>
              <span className="font-code-dense text-code-dense text-on-surface-variant font-mono">0 TRIPPED</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col justify-between shadow-sm border border-outline-variant/20">
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              KEY ENCRYPTION
            </span>
            <div className="flex items-baseline justify-between mt-space-xs">
              <span className="font-label-mono-lg text-label-mono-lg text-secondary font-semibold font-mono">
                AES_256_GCM
              </span>
              <span className="font-code-dense text-code-dense text-secondary font-mono">LOCAL REST</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col justify-between shadow-sm border border-outline-variant/20">
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              PERSISTENT STORE
            </span>
            <div className="flex items-baseline justify-between mt-space-xs">
              <span className="font-label-mono-lg text-label-mono-lg text-tertiary font-semibold font-mono">
                SQLite WAL
              </span>
              <span className="font-code-dense text-code-dense text-primary font-mono">ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Network / Ops Core & ElevenLabs Engine */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">
        {/* SECTION 1: Ops & Gateway Core */}
        <section className="xl:col-span-6 bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md border border-outline-variant/30">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/30">
            <div className="flex items-center gap-space-sm">
              <span className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center font-code-dense text-code-dense text-primary font-bold">
                01
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Proxy &amp; Ingress Core
              </h2>
            </div>
            <span className="font-code-dense text-code-dense text-on-surface-variant bg-surface-container px-space-sm py-space-xs rounded">
              GATEWAY_CONFIG
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Cluster Identifier
              </label>
              <input
                type="text"
                value={ops.clusterId}
                onChange={(e) => {
                  setIsDirtyOps(true);
                  setOps((prev) => ({ ...prev, clusterId: e.target.value }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Environment
              </label>
              <input
                type="text"
                value={ops.environment}
                onChange={(e) => {
                  setIsDirtyOps(true);
                  setOps((prev) => ({ ...prev, environment: e.target.value }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Healthcheck Interval (ms)
              </label>
              <input
                type="number"
                value={ops.healthcheckIntervalMs}
                onChange={(e) => {
                  setIsDirtyOps(true);
                  setOps((prev) => ({ ...prev, healthcheckIntervalMs: Number(e.target.value) }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Request Timeout (ms)
              </label>
              <input
                type="number"
                value={ops.requestTimeoutMs}
                onChange={(e) => {
                  setIsDirtyOps(true);
                  setOps((prev) => ({ ...prev, requestTimeoutMs: Number(e.target.value) }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          <div className="p-space-md bg-surface-container rounded-lg flex items-center justify-between mt-2 border border-outline-variant/20">
            <div>
              <span className="font-label-mono-md text-label-mono-md text-on-surface font-semibold block">
                Automatic Key Recovery
              </span>
              <span className="font-body-sm text-body-sm text-outline">
                Automatically reactivates exhausted keys once reset period passes.
              </span>
            </div>
            <span className="font-code-dense text-code-dense text-primary font-bold">
              {ops.autoRecoveryIntervalMs / 1000}s interval
            </span>
          </div>

          <div className="flex justify-end pt-space-xs">
            <button
              onClick={handleSaveOps}
              disabled={savingOps}
              className="px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors cursor-pointer"
            >
              Save Ingress Core
            </button>
          </div>
        </section>

        {/* SECTION 2: ElevenLabs TTS Engine */}
        <section className="xl:col-span-6 bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md border border-outline-variant/30">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/30">
            <div className="flex items-center gap-space-sm">
              <span className="h-6 w-6 rounded bg-secondary/10 flex items-center justify-center font-code-dense text-code-dense text-secondary font-bold">
                02
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                ElevenLabs TTS &amp; Audio Synthesizer
              </h2>
            </div>
            <span className="font-code-dense text-code-dense text-on-surface-variant bg-surface-container px-space-sm py-space-xs rounded">
              AUDIO_ROUTER
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Default Voice ID
              </label>
              <input
                type="text"
                value={tts.defaultVoiceId}
                onChange={(e) => {
                  setIsDirtyTts(true);
                  setTts((prev) => ({ ...prev, defaultVoiceId: e.target.value }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex flex-col gap-space-xs">
              <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                Model Identifier
              </label>
              <input
                type="text"
                value={tts.modelId}
                onChange={(e) => {
                  setIsDirtyTts(true);
                  setTts((prev) => ({ ...prev, modelId: e.target.value }));
                }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-space-sm py-space-xs font-label-mono-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          <div className="p-space-md bg-surface-container rounded-lg flex items-center justify-between border border-outline-variant/20">
            <div>
              <span className="font-label-mono-md text-label-mono-md text-on-surface font-semibold block">
                Disk Audio Cache
              </span>
              <span className="font-body-sm text-body-sm text-outline">
                Caches repetitive synthesis results locally in data/audio-cache/ to save quota.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tts.cacheEnabled}
                onChange={(e) => {
                  setIsDirtyTts(true);
                  setTts((prev) => ({ ...prev, cacheEnabled: e.target.checked }));
                }}
                className="accent-primary h-4 w-4"
              />
            </label>
          </div>

          {/* Distributed Parallel Voice Estafet Settings */}
          <div className="p-space-md bg-surface-container rounded-lg flex flex-col gap-space-sm border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-label-mono-md text-label-mono-md text-secondary font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">dynamic_feed</span>
                  Distributed Voice Estafet (Multi-Key Sentence Worker)
                </span>
                <span className="font-body-sm text-body-sm text-outline block mt-0.5">
                  Membagi kalimat secara paralel ke beberapa API key ElevenLabs aktif sekaligus &amp; menggabungkan audio secara mulus.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={tts.distributedEnabled !== false}
                  onChange={(e) => {
                    setIsDirtyTts(true);
                    setTts((prev) => ({ ...prev, distributedEnabled: e.target.checked }));
                  }}
                  className="accent-secondary h-4 w-4"
                />
              </label>
            </div>

            {tts.distributedEnabled !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm pt-space-xs border-t border-outline-variant/10">
                <div className="flex flex-col gap-1">
                  <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                    Max Parallel Workers (Keys)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={tts.maxConcurrency || 6}
                    onChange={(e) => {
                      setIsDirtyTts(true);
                      setTts((prev) => ({ ...prev, maxConcurrency: Number(e.target.value) }));
                    }}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded px-space-sm py-1 font-label-mono-sm text-on-surface font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-code-dense text-code-dense text-outline uppercase font-semibold">
                    Min Sentence Chars
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={tts.minChunkChars || 25}
                    onChange={(e) => {
                      setIsDirtyTts(true);
                      setTts((prev) => ({ ...prev, minChunkChars: Number(e.target.value) }));
                    }}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded px-space-sm py-1 font-label-mono-sm text-on-surface font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live TTS Test Player Station */}
          <div className="p-space-md bg-surface-container-lowest rounded-lg border border-outline-variant/20 flex flex-col gap-space-sm">
            <span className="font-code-dense text-code-dense text-secondary uppercase font-semibold">
              Audio Synthesis Station (Live Test)
            </span>
            <textarea
              rows={2}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Type speech prompt..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-space-xs font-body-sm text-on-surface focus:outline-none resize-none"
            />
            <div className="flex items-center justify-between flex-wrap gap-space-xs">
              <button
                onClick={handleTestTts}
                disabled={testingTts}
                className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-secondary text-on-secondary font-label-mono-sm font-semibold hover:bg-secondary-fixed transition-colors shadow-sm cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[16px] ${testingTts ? 'animate-spin' : ''}`}>
                  {testingTts ? 'sync' : 'volume_up'}
                </span>
                <span>{testingTts ? 'Synthesizing Audio...' : 'Test ElevenLabs Audio'}</span>
              </button>
              {audioUrl && (
                <audio controls src={audioUrl} className="h-8 max-w-[260px]" autoPlay />
              )}
            </div>
          </div>

          <div className="flex justify-end pt-space-xs">
            <button
              onClick={handleSaveTts}
              disabled={savingTts}
              className="px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim transition-colors cursor-pointer"
            >
              Save TTS Engine
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
