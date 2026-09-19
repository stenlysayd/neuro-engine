import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { apiRequest, wsUrl, type DashboardSnapshot } from './api';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { TelemetryPage } from './pages/TelemetryPage';
import { KeyPoolsPage } from './pages/KeyPoolsPage';
import { BrainRouterPage } from './pages/BrainRouterPage';
import { UsageLogsPage } from './pages/UsageLogsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await apiRequest<DashboardSnapshot>('/api/dashboard');
      setSnapshot((prev) => {
        if (!prev) return data;
        const sameBrain = JSON.stringify(prev.brainConfig) === JSON.stringify(data.brainConfig);
        const sameTts = JSON.stringify(prev.ttsConfig) === JSON.stringify(data.ttsConfig);
        const sameOps = JSON.stringify(prev.opsConfig) === JSON.stringify(data.opsConfig);
        return {
          ...data,
          brainConfig: sameBrain ? prev.brainConfig : data.brainConfig,
          ttsConfig: sameTts ? prev.ttsConfig : data.ttsConfig,
          opsConfig: sameOps ? prev.opsConfig : data.opsConfig
        };
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to API');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 4000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  // Live WebSockets Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl());
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'dashboard') {
              setSnapshot((prev) => {
                if (!prev) return msg.payload;
                const sameBrain = JSON.stringify(prev.brainConfig) === JSON.stringify(msg.payload.brainConfig);
                const sameTts = JSON.stringify(prev.ttsConfig) === JSON.stringify(msg.payload.ttsConfig);
                const sameOps = JSON.stringify(prev.opsConfig) === JSON.stringify(msg.payload.opsConfig);
                return {
                  ...msg.payload,
                  brainConfig: sameBrain ? prev.brainConfig : msg.payload.brainConfig,
                  ttsConfig: sameTts ? prev.ttsConfig : msg.payload.ttsConfig,
                  opsConfig: sameOps ? prev.opsConfig : msg.payload.opsConfig
                };
              });
            } else if (msg.type === 'telemetry') {
              setSnapshot((prev) => (prev ? { ...prev, telemetry: msg.payload } : prev));
            } else if (String(msg.type).startsWith('key:') || String(msg.type).startsWith('usage:')) {
              fetchSnapshot();
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 3000);
        };
      } catch {
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();
    return () => {
      ws?.close();
      clearTimeout(reconnectTimeout);
    };
  }, [fetchSnapshot]);

  if (loading && !snapshot) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface">
        <div className="flex items-center gap-space-sm p-space-lg rounded-xl bg-surface-container-low border border-outline-variant/30 shadow-2xl">
          <span className="material-symbols-outlined text-primary text-[28px] animate-spin">
            sync
          </span>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm font-bold">CORE-OPS INITIALIZING</span>
            <span className="font-code-dense text-code-dense text-outline">Connecting to SQLite service...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface p-space-md">
        <div className="max-w-md p-space-lg rounded-xl bg-surface-container-low border border-error/40 shadow-2xl flex flex-col gap-space-sm">
          <div className="flex items-center gap-space-sm text-error">
            <span className="material-symbols-outlined text-[24px]">error</span>
            <h2 className="font-headline-sm text-headline-sm font-bold">API Offline</h2>
          </div>
          <p className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
            Could not connect to Core-Ops API at <code className="text-primary font-mono">http://localhost:3001</code>.
          </p>
          <p className="font-code-dense text-code-dense text-outline bg-surface-container-lowest p-space-xs rounded">
            {error}
          </p>
          <button
            onClick={fetchSnapshot}
            className="mt-2 px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-mono-sm font-semibold hover:bg-primary-fixed-dim cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-surface text-on-surface font-body-md antialiased selection:bg-primary selection:text-on-primary">
        {/* Obsidian Fixed Sidebar */}
        <Sidebar snapshot={snapshot} />

        {/* Obsidian Fixed Topbar */}
        <Topbar snapshot={snapshot} onRefresh={fetchSnapshot} isSyncing={syncing} />

        {/* Main Routed Page Content */}
        <main className="pl-64 pt-14 px-margin bg-surface min-h-screen">
          <Routes>
            <Route path="/" element={<Navigate to="/key-pools" replace />} />
            <Route path="/telemetry" element={<TelemetryPage snapshot={snapshot} onRefresh={fetchSnapshot} />} />
            <Route path="/key-pools" element={<KeyPoolsPage snapshot={snapshot} onRefresh={fetchSnapshot} />} />
            <Route path="/brain-router" element={<BrainRouterPage snapshot={snapshot} onRefresh={fetchSnapshot} />} />
            <Route path="/usage-logs" element={<UsageLogsPage snapshot={snapshot} onRefresh={fetchSnapshot} />} />
            <Route path="/settings" element={<SettingsPage snapshot={snapshot} onRefresh={fetchSnapshot} />} />
            <Route path="*" element={<Navigate to="/key-pools" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
