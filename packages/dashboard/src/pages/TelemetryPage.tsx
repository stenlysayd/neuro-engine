import { useMemo, type FC } from 'react';
import { type DashboardSnapshot, formatNumber, formatTimeAgo, labelForProvider } from '../api';

interface TelemetryPageProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
}

export const TelemetryPage: FC<TelemetryPageProps> = ({ snapshot, onRefresh }) => {
  const { telemetry, usageLogs } = snapshot;
  const throughput = telemetry.usage.throughput.toFixed(1);
  const avgLatency = telemetry.usage.avgLatency;
  const healthPercent = telemetry.healthPercent.toFixed(1);
  const volume = telemetry.usage.volume;
  const keyStats = telemetry.keys;

  const latencies = useMemo(() => {
    return usageLogs.map((l) => l.latencyMs).filter((l) => l > 0).sort((a, b) => a - b);
  }, [usageLogs]);

  const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : avgLatency;
  const p99Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : avgLatency;
  const peakLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

  const providerMetrics = useMemo(() => {
    const map: Record<string, { requests: number; successes: number; totalLatency: number; countLatency: number }> = {};
    for (const log of usageLogs) {
      const prov = (log.provider || 'unknown').toLowerCase();
      map[prov] ??= { requests: 0, successes: 0, totalLatency: 0, countLatency: 0 };
      map[prov].requests += 1;
      if (log.success) map[prov].successes += 1;
      if (log.latencyMs > 0) {
        map[prov].totalLatency += log.latencyMs;
        map[prov].countLatency += 1;
      }
    }
    return map;
  }, [usageLogs]);

  const rateLimitLogs = usageLogs.filter((l) => l.statusCode === 429).length;
  const rateLimitPercent = usageLogs.length > 0 ? ((rateLimitLogs / usageLogs.length) * 100).toFixed(1) : '0.0';

  const providerList = [
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      model: 'claude-3-5-sonnet',
      tier: 'Cascade Node',
      icon: 'psychology'
    },
    {
      id: 'openai',
      name: 'OpenAI GPT-4o',
      model: 'gpt-4o-mini',
      tier: 'Cascade Node',
      icon: 'hub'
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs Voice',
      model: snapshot.ttsConfig.modelId || 'eleven_multilingual_v2',
      tier: 'TTS Audio Engine',
      icon: 'record_voice_over'
    },
    {
      id: 'groq',
      name: 'Groq LPUs',
      model: 'llama-3.3-70b',
      tier: 'Cascade Node',
      icon: 'bolt'
    },
    {
      id: 'google',
      name: 'Google Gemini',
      model: 'gemini-1.5-flash',
      tier: 'Cascade Node',
      icon: 'auto_awesome'
    },
    {
      id: 'local',
      name: 'Local Ollama / vLLM',
      model: 'llama3 / mistral',
      tier: 'Self-Hosted',
      icon: 'dns'
    }
  ];

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Top Operational Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md py-space-lg">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className="font-code-dense text-code-dense text-primary uppercase px-space-xs py-0.5 rounded bg-surface-container-high font-semibold">
              TELEMETRY_ENGINE_V3
            </span>
            <span className="text-outline text-code-dense font-code-dense">/</span>
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase font-semibold">
              SUBSYSTEM_MONITOR
            </span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
            Real-time Telemetry &amp; Provider Health Grid
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg bg-surface-container-low shadow-sm border border-outline-variant/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="font-code-dense text-code-dense text-on-surface">
              Auto-refresh: <strong className="text-primary font-code-dense">1s</strong> (Live WebSockets connected)
            </span>
            <button
              onClick={onRefresh}
              className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Force Sync"
            >
              <span className="material-symbols-outlined text-[16px] block">sync</span>
            </button>
          </div>
          <div className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-container-high shadow-sm border border-outline-variant/30">
            <span className="material-symbols-outlined text-primary text-[15px]">verified_user</span>
            <span className="font-code-dense text-code-dense text-primary uppercase font-semibold tracking-wider">
              SYSTEM HEALTH: NOMINAL ({healthPercent}% Uptime)
            </span>
          </div>
        </div>
      </div>

      {/* Key Ops KPI Grid (4 Metric Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter mb-space-lg">
        {/* Card 1: Global Throughput */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
                GLOBAL THROUGHPUT
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">{throughput}</span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">req/s</span>
              </div>
            </div>
            <div className="flex items-center gap-space-xs px-space-xs py-0.5 rounded bg-surface-container-high">
              <span className="material-symbols-outlined text-primary text-[14px]">speed</span>
              <span className="font-label-mono-sm text-label-mono-sm text-primary font-semibold">
                {telemetry.usage.requests} reqs
              </span>
            </div>
          </div>
          <div className="mt-space-md">
            {/* SVG Sparkline */}
            <svg className="w-full h-9 stroke-primary fill-none" preserveAspectRatio="none" viewBox="0 0 160 36">
              <path
                d="M0,28 L15,26 L30,29 L45,21 L60,24 L75,15 L90,19 L105,10 L120,16 L135,8 L150,12 L160,7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <path
                className="text-primary/10"
                d="M0,28 L15,26 L30,29 L45,21 L60,24 L75,15 L90,19 L105,10 L120,16 L135,8 L150,12 L160,7 L160,36 L0,36 Z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </div>
          <div className="flex items-center justify-between pt-space-sm mt-space-xs font-code-dense text-code-dense text-on-surface-variant">
            <span>PEAK LATENCY: <strong className="text-on-surface font-label-mono-sm">{peakLatency}ms</strong></span>
            <span>LOAD: <strong className="text-secondary font-label-mono-sm">{telemetry.usage.requests > 0 ? 'ACTIVE' : 'IDLE'}</strong></span>
          </div>
        </div>

        {/* Card 2: Latency Matrix */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
                LATENCY (P95 / P99)
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xs">
                <span className="font-headline-lg text-headline-lg text-secondary font-bold">{p95Latency}</span>
                <span className="font-label-mono-sm text-label-mono-sm text-outline">/</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{p99Latency}</span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">ms</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-secondary text-[20px]">speed</span>
          </div>
          <div className="space-y-1.5 mt-space-md font-code-dense text-code-dense">
            {['anthropic', 'openai', 'elevenlabs'].map((provId) => {
              const m = providerMetrics[provId];
              const latDisplay = m && m.countLatency > 0 ? `${Math.round(m.totalLatency / m.countLatency)}ms` : 'No logs';
              return (
                <div key={provId} className="flex items-center justify-between">
                  <span className="text-on-surface-variant flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {labelForProvider(provId)}
                  </span>
                  <span className="text-on-surface font-label-mono-sm font-semibold">{latDisplay}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 3: 429 Rate-Limit Pressure */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-tertiary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
                429 RATE-LIMIT PRESSURE
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xs">
                <span className="font-headline-lg text-headline-lg text-tertiary font-bold">
                  {rateLimitPercent}%
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  ({rateLimitLogs} events)
                </span>
              </div>
            </div>
            <div className="px-space-xs py-0.5 rounded bg-surface-container-high">
              <span className="font-code-dense text-code-dense text-tertiary uppercase font-semibold">
                {Number(rateLimitPercent) > 2.0 ? 'WARN > 2%' : 'NOMINAL'}
              </span>
            </div>
          </div>
          <div className="mt-space-md space-y-2">
            <div>
              <div className="flex justify-between font-code-dense text-code-dense mb-1">
                <span className="text-on-surface-variant">Active Key Pools</span>
                <span className="text-primary font-label-mono-sm font-semibold">
                  {keyStats.active} / {keyStats.total} Active
                </span>
              </div>
              <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${(keyStats.active / (keyStats.total || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <div className="pt-space-sm mt-space-xs font-code-dense text-code-dense text-outline flex items-center justify-between">
            <span>AUTO-FAILOVER: <strong className="text-primary font-label-mono-sm">ACTIVE</strong></span>
            <span>EXHAUSTED: <strong className="text-tertiary font-label-mono-sm">{keyStats.exhausted} KEYS</strong></span>
          </div>
        </div>

        {/* Card 4: Consumption Volume */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
                TOTAL CONSUMED
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">
                  {formatNumber(volume)}
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">units</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-primary text-[20px]">data_array</span>
          </div>
          <div className="mt-space-md">
            <div className="flex justify-between font-code-dense text-code-dense mb-1">
              <span className="text-on-surface-variant">Success Rate: <strong className="text-on-surface font-label-mono-sm">{telemetry.usage.successRate}%</strong></span>
              <span className="text-outline">15m Window</span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-primary h-full rounded-l-full transition-all"
                style={{ width: `${Math.min(100, telemetry.usage.successRate)}%` }}
              />
            </div>
          </div>
          <div className="pt-space-sm mt-space-xs font-code-dense text-code-dense text-outline flex items-center justify-between">
            <span>UPTIME: <strong className="text-primary font-label-mono-sm">{telemetry.uptimeSeconds}s</strong></span>
            <span>STATUS: <strong className="text-primary font-label-mono-sm">ONLINE</strong></span>
          </div>
        </div>
      </div>

      {/* Provider Subsystem Grid (6 Endpoints) */}
      <section className="mb-space-lg">
        <div className="flex items-center justify-between mb-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">dns</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Provider Subsystem Grid (6 Endpoints)
            </h2>
          </div>
          <span className="font-code-dense text-code-dense text-outline font-semibold">
            Active Core: {labelForProvider(telemetry.activeBrain.provider)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-sm">
          {providerList.map((p) => {
            const providerStat = keyStats.byProvider[p.id] || { active: 0, total: 0, exhausted: 0, error: 0 };
            const m = providerMetrics[p.id];
            const pLatency = m && m.countLatency > 0 ? `${Math.round(m.totalLatency / m.countLatency)}ms` : 'Idle';
            const pHealth = m && m.requests > 0 ? `${((m.successes / m.requests) * 100).toFixed(1)}%` : '100.0%';
            const isNominal = !m || m.requests === 0 || m.successes === m.requests;

            return (
              <div
                key={p.id}
                className="rounded-xl bg-surface-container-low p-space-md border border-outline-variant/30 flex flex-col justify-between shadow-sm hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">{p.icon}</span>
                      <div>
                        <h3 className="font-label-mono-md text-label-mono-md text-on-surface font-semibold">
                          {p.name}
                        </h3>
                        <span className="font-code-dense text-code-dense text-outline">{p.model}</span>
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded font-code-dense text-code-dense font-semibold uppercase flex items-center gap-1 ${
                        isNominal ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isNominal ? 'bg-primary animate-pulse' : 'bg-tertiary'
                        }`}
                      />
                      {isNominal ? 'NOMINAL' : 'DEGRADED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-space-xs py-space-xs bg-surface-container-lowest rounded-lg px-space-sm text-on-surface-variant font-code-dense text-code-dense my-2 border border-outline-variant/20">
                    <div>
                      <span className="block text-outline">AVG LATENCY</span>
                      <span className="text-secondary font-bold font-mono">{pLatency}</span>
                    </div>
                    <div>
                      <span className="block text-outline">SUCCESS RATE</span>
                      <span className="text-primary font-bold font-mono">{pHealth}</span>
                    </div>
                    <div>
                      <span className="block text-outline">ACTIVE KEYS</span>
                      <span className="text-on-surface font-bold font-mono">
                        {providerStat.active} / {providerStat.total}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-outline font-code-dense text-code-dense pt-2 border-t border-outline-variant/20">
                  <span>TIER: <strong className="text-on-surface-variant">{p.tier}</strong></span>
                  <span className="text-primary font-semibold">CIRCUIT: CLOSED</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live Request Stream & Error Log */}
      <section className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-space-md shadow-sm">
        <div className="flex items-center justify-between mb-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-secondary text-[18px]">view_timeline</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Live Request Flow &amp; Trace Buffer
            </h2>
          </div>
          <span className="font-code-dense text-code-dense text-outline font-semibold">
            Showing latest {Math.min(10, usageLogs.length)} events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-code-dense text-code-dense border-collapse">
            <thead className="bg-surface-container-high/60 text-outline uppercase border-b border-outline-variant/30">
              <tr>
                <th className="py-space-xs px-space-md">Time</th>
                <th className="py-space-xs px-space-md">Provider / Type</th>
                <th className="py-space-xs px-space-md">Model</th>
                <th className="py-space-xs px-space-md">Volume</th>
                <th className="py-space-xs px-space-md">Latency</th>
                <th className="py-space-xs px-space-md">Status</th>
                <th className="py-space-xs px-space-md">Request ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {usageLogs.slice(0, 10).map((log) => {
                const ok = Boolean(log.success);
                return (
                  <tr key={log.id} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-space-sm px-space-md text-on-surface-variant whitespace-nowrap font-mono">
                      {formatTimeAgo(log.createdAt)}
                    </td>
                    <td className="py-space-sm px-space-md text-on-surface font-semibold font-label-mono-sm">
                      {labelForProvider(log.provider || 'unknown')} · {log.requestType}
                    </td>
                    <td className="py-space-sm px-space-md text-outline font-mono">{log.model || '-'}</td>
                    <td className="py-space-sm px-space-md text-primary font-mono font-semibold">
                      {formatNumber(log.tokensOrChars)}
                    </td>
                    <td className="py-space-sm px-space-md text-secondary font-mono font-semibold">{log.latencyMs}ms</td>
                    <td className="py-space-sm px-space-md">
                      <span
                        className={`px-1.5 py-0.5 rounded uppercase font-semibold border ${
                          ok
                            ? 'bg-primary/10 text-primary border-primary/25'
                            : 'bg-error/10 text-error border-error/25'
                        }`}
                      >
                        {log.statusCode || (ok ? '200 OK' : 'FAIL')}
                      </span>
                    </td>
                    <td className="py-space-sm px-space-md text-outline font-mono truncate max-w-[200px]" title={log.requestId}>
                      {log.requestId}
                    </td>
                  </tr>
                );
              })}
              {usageLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-space-lg text-center text-outline">
                    No requests recorded in local trace buffer yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
