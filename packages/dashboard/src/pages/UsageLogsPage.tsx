import { useState, useMemo, type FC } from 'react';
import { type DashboardSnapshot, type UsageLog, formatNumber, formatTimeAgo, labelForProvider, toCsv } from '../api';
import { RequestInspectorDrawer } from '../components/drawers/RequestInspectorDrawer';

interface UsageLogsPageProps {
  snapshot: DashboardSnapshot;
  onRefresh?: () => void;
}

export const UsageLogsPage: FC<UsageLogsPageProps> = ({ snapshot }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '200' | '429' | '500'>('all');
  const [liveTail, setLiveTail] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<UsageLog | null>(null);

  const logs = snapshot.usageLogs;

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !searchQuery ||
        `${log.requestId} ${log.provider} ${log.model} ${log.keyId} ${log.error}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchProvider = providerFilter === 'all' || log.provider === providerFilter;
      const matchType = typeFilter === 'all' || log.requestType === typeFilter;

      let matchStatus = true;
      if (statusFilter === '200') matchStatus = Boolean(log.success) && (!log.statusCode || log.statusCode === 200);
      else if (statusFilter === '429') matchStatus = log.statusCode === 429;
      else if (statusFilter === '500') matchStatus = log.statusCode === 500 || (!log.success && log.statusCode !== 429);

      return matchSearch && matchProvider && matchType && matchStatus;
    });
  }, [logs, searchQuery, providerFilter, typeFilter, statusFilter]);

  const handleExport = (format: 'csv' | 'json') => {
    const data = format === 'json' ? JSON.stringify(filteredLogs, null, 2) : toCsv(filteredLogs);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-trace-logs-${Date.now()}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const providers = ['all', 'anthropic', 'openai', 'elevenlabs', 'groq', 'google', 'local'];

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Top View Heading & Stream Meta */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pt-space-md pb-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="h-9 w-9 rounded-lg bg-surface-container-high flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-primary text-[20px]">view_timeline</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
                Usage Logs &amp; Request Trace Inspector
              </h1>
              <span className="bg-primary/10 text-primary font-code-dense text-code-dense px-space-xs py-[2px] rounded uppercase font-semibold">
                CLUSTER TAP ACTIVE
              </span>
            </div>
            <p className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
              Real-time gateway telemetry, fallback trajectory graphs, and multi-provider payload telemetry
            </p>
          </div>
        </div>

        {/* Live Tail Toggle & Export Actions */}
        <div className="flex items-center gap-space-xs">
          <button
            onClick={() => setLiveTail(!liveTail)}
            className="h-8 px-space-md bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-mono-md text-label-mono-md rounded-lg flex items-center gap-space-xs transition-colors shadow-sm border border-outline-variant/30 cursor-pointer"
          >
            <span
              className={`h-2 w-2 rounded-full ${liveTail ? 'bg-primary animate-pulse' : 'bg-outline'}`}
            />
            <span className={liveTail ? 'text-primary font-semibold' : 'text-outline font-semibold'}>
              LIVE TAIL: {liveTail ? 'ON' : 'PAUSED'}
            </span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="h-8 px-space-sm bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-mono-sm rounded-lg flex items-center gap-space-xs transition-colors shadow-sm border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-outline text-[16px]">file_download</span>
            <span>CSV</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="h-8 px-space-sm bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-mono-sm rounded-lg flex items-center gap-space-xs transition-colors shadow-sm border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-outline text-[16px]">data_object</span>
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Filter & Query Command Strip */}
      <div className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-space-sm mb-space-md shadow-md border border-outline-variant/30">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-xs">
          {/* Search Input */}
          <div className="md:col-span-6 relative flex items-center">
            <span className="material-symbols-outlined text-outline absolute left-3 text-[18px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Request ID, Model, or Key Hash (e.g. req_..., sk-ant-...)"
              className="w-full h-8 pl-9 pr-space-md bg-surface-container-lowest font-code-dense text-label-mono-sm text-on-surface placeholder:text-outline/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary shadow-inner border border-outline-variant/20"
            />
            <span className="absolute right-2 font-code-dense text-code-dense text-outline bg-surface-container-high px-space-xs py-[2px] rounded">
              ⌘K
            </span>
          </div>

          {/* Provider Selector */}
          <div className="md:col-span-3 relative">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="w-full h-8 px-space-sm bg-surface-container-lowest font-label-mono-md text-label-mono-md text-on-surface rounded-lg focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer border border-outline-variant/20"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p === 'all' ? 'All Providers (6)' : labelForProvider(p)}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-outline absolute right-2 top-2 text-[16px] pointer-events-none">
              tune
            </span>
          </div>

          {/* Request Type Selector */}
          <div className="md:col-span-3 relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full h-8 px-space-sm bg-surface-container-lowest font-label-mono-md text-label-mono-md text-on-surface rounded-lg focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer border border-outline-variant/20"
            >
              <option value="all">All Request Types</option>
              <option value="chat_completion">LLM Chat Completion</option>
              <option value="tts">TTS Audio Stream</option>
            </select>
            <span className="material-symbols-outlined text-outline absolute right-2 top-2 text-[16px] pointer-events-none">
              category
            </span>
          </div>
        </div>

        {/* Quick Status Pills */}
        <div className="flex flex-wrap items-center justify-between gap-space-xs pt-space-xs">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="font-code-dense text-code-dense text-outline uppercase mr-space-xs">Status:</span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-space-sm py-[3px] rounded-lg font-code-dense text-code-dense transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-surface-container-high text-primary font-bold shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              ALL ({logs.length})
            </button>
            <button
              onClick={() => setStatusFilter('200')}
              className={`px-space-sm py-[3px] rounded-lg font-code-dense text-code-dense flex items-center gap-[4px] transition-colors cursor-pointer ${
                statusFilter === '200'
                  ? 'bg-surface-container-high text-primary font-bold shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> 200 OK
            </button>
            <button
              onClick={() => setStatusFilter('429')}
              className={`px-space-sm py-[3px] rounded-lg font-code-dense text-code-dense flex items-center gap-[4px] transition-colors cursor-pointer ${
                statusFilter === '429'
                  ? 'bg-surface-container-high text-tertiary font-bold shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-tertiary" /> 429 RateLimit
            </button>
            <button
              onClick={() => setStatusFilter('500')}
              className={`px-space-sm py-[3px] rounded-lg font-code-dense text-code-dense flex items-center gap-[4px] transition-colors cursor-pointer ${
                statusFilter === '500'
                  ? 'bg-surface-container-high text-error font-bold shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-error" /> 500 ServerErr
            </button>
          </div>
          <div className="flex items-center gap-space-sm font-label-mono-sm text-label-mono-sm text-outline">
            <span className="bg-surface-container px-space-xs py-[2px] rounded text-on-surface-variant font-code-dense text-code-dense">
              Buffer: {filteredLogs.length} traces loaded
            </span>
          </div>
        </div>
      </div>

      {/* High-Density Request Trace Table */}
      <section className="w-full bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-code-dense text-code-dense border-collapse">
            <thead className="bg-surface-container-high/80 text-outline uppercase border-b border-outline-variant/30">
              <tr>
                <th className="py-space-xs px-space-md">Timestamp</th>
                <th className="py-space-xs px-space-md">Provider</th>
                <th className="py-space-xs px-space-md">Type</th>
                <th className="py-space-xs px-space-md">Model</th>
                <th className="py-space-xs px-space-md">Volume</th>
                <th className="py-space-xs px-space-md">Latency</th>
                <th className="py-space-xs px-space-md">Status</th>
                <th className="py-space-xs px-space-md">Trace ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 cursor-pointer">
              {filteredLogs.map((log) => {
                const ok = Boolean(log.success);
                const isSelected = selectedLog?.id === log.id;
                return (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`transition-colors ${
                      isSelected ? 'bg-surface-container-high' : 'hover:bg-surface-container-high/40'
                    }`}
                  >
                    <td className="py-space-sm px-space-md font-mono text-on-surface-variant">
                      {formatTimeAgo(log.createdAt)}
                    </td>
                    <td className="py-space-sm px-space-md font-label-mono-sm text-label-mono-sm font-semibold text-on-surface">
                      {labelForProvider(log.provider || 'unknown')}
                    </td>
                    <td className="py-space-sm px-space-md text-on-surface-variant">
                      <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/20 uppercase font-mono">
                        {log.requestType}
                      </span>
                    </td>
                    <td className="py-space-sm px-space-md font-mono text-on-surface">{log.model || '-'}</td>
                    <td className="py-space-sm px-space-md font-mono text-primary font-semibold">
                      {formatNumber(log.tokensOrChars)}
                    </td>
                    <td className="py-space-sm px-space-md font-mono text-secondary font-semibold">
                      {log.latencyMs}ms
                    </td>
                    <td className="py-space-sm px-space-md">
                      <span
                        className={`inline-flex items-center gap-1 px-space-xs py-0.5 rounded border uppercase font-semibold ${
                          ok
                            ? 'bg-primary/10 text-primary border-primary/25'
                            : 'bg-error/10 text-error border-error/25'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-primary' : 'bg-error'}`} />
                        {log.statusCode || (ok ? '200 OK' : 'FAIL')}
                      </span>
                    </td>
                    <td className="py-space-sm px-space-md font-mono text-outline truncate max-w-[200px]" title={log.requestId}>
                      {log.requestId}
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-space-xl text-center text-outline font-label-mono-sm">
                    No trace logs match the active filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Slide-over Inspector Drawer */}
      {selectedLog && (
        <RequestInspectorDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
};
