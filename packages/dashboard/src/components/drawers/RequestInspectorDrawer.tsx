import { useState, type FC } from 'react';
import { type UsageLog, formatNumber, labelForProvider } from '../../api';

interface RequestInspectorDrawerProps {
  log: UsageLog;
  onClose: () => void;
}

export const RequestInspectorDrawer: FC<RequestInspectorDrawerProps> = ({ log, onClose }) => {
  const [activeTab, setActiveTab] = useState<'headers' | 'params' | 'raw'>('headers');
  const [copied, setCopied] = useState<boolean>(false);

  const isSuccess = Boolean(log.success);
  const statusTone = isSuccess ? 'text-primary bg-primary/10 border-primary/25' : 'text-error bg-error/10 border-error/25';

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parsedMetadata = (() => {
    if (!log.metadata) return null;
    if (typeof log.metadata === 'object') return log.metadata;
    try {
      return JSON.parse(log.metadata);
    } catch {
      return { raw: log.metadata };
    }
  })();

  const traceHeaders = {
    'x-request-id': log.requestId,
    'x-provider': log.provider || 'direct',
    'x-model': log.model || 'default',
    'x-request-type': log.requestType,
    'x-latency-ms': `${log.latencyMs} ms`,
    'x-status-code': log.statusCode || (isSuccess ? 200 : 500),
    'x-created-at': log.createdAt,
    'x-key-id': log.keyId || 'none'
  };

  const traceParams = {
    id: log.id,
    provider: log.provider,
    model: log.model,
    requestType: log.requestType,
    tokensOrChars: log.tokensOrChars,
    success: isSuccess,
    statusCode: log.statusCode,
    latencyMs: log.latencyMs,
    error: log.error,
    metadata: parsedMetadata,
    keyTier: log.keyTier || null
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-surface-container-lowest/80 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-surface-container-low border-l border-outline-variant/40 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-outline-variant/30">
          <div className="flex items-center gap-space-sm min-w-0">
            <div className="h-8 w-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[18px]">travel_explore</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">
                  Trace #{log.id}
                </span>
                <span className={`font-code-dense text-code-dense px-1.5 py-0.5 rounded border uppercase font-semibold ${statusTone}`}>
                  {log.statusCode || (isSuccess ? '200 OK' : 'FAILED')}
                </span>
              </div>
              <p className="font-code-dense text-code-dense text-outline truncate font-mono">{log.requestId}</p>
            </div>
          </div>
          <div className="flex items-center gap-space-xs">
            <button
              onClick={handleCopyJson}
              className="h-8 px-space-sm rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-mono-sm flex items-center gap-space-xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">
                {copied ? 'check' : 'content_copy'}
              </span>
              <span>{copied ? 'COPIED!' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-space-lg flex flex-col gap-space-md">
          {/* Fallback Hop Timeline */}
          <div className="p-space-sm rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col gap-space-xs">
            <span className="font-code-dense text-code-dense text-outline uppercase tracking-wider font-semibold">
              Gateway Execution Path
            </span>
            <div className="flex items-center gap-space-sm py-1 font-code-dense text-code-dense">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center font-bold ${isSuccess ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error'}`}>
                01
              </span>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <span className="text-on-surface font-semibold font-label-mono-sm">
                    {labelForProvider(log.provider || 'unknown')}
                  </span>
                  <span className="text-outline ml-2 font-mono">[{log.model || 'default-model'}]</span>
                </div>
                <div className="text-right font-mono">
                  <span className={`font-semibold ${isSuccess ? 'text-primary' : 'text-error'}`}>
                    {log.latencyMs}ms
                  </span>
                </div>
              </div>
            </div>
            {log.error && (
              <div className="mt-1 p-space-xs px-space-sm rounded bg-error/10 border border-error/20 text-error font-code-dense text-code-dense font-mono whitespace-pre-wrap break-all">
                {log.error}
              </div>
            )}
          </div>

          {/* Node & Token Breakdown Grid */}
          <div className="grid grid-cols-2 gap-space-xs">
            <div className="p-space-sm rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">REQUEST TYPE</span>
              <span className="font-label-mono-sm text-label-mono-sm text-on-surface mt-1 font-semibold font-mono">
                {log.requestType.toUpperCase()}
              </span>
              <span className="font-code-dense text-code-dense text-outline">Cluster Route</span>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">VOLUME / PAYLOAD</span>
              <span className="font-label-mono-sm text-label-mono-sm text-primary mt-1 font-semibold font-mono">
                {formatNumber(log.tokensOrChars)} {log.requestType === 'tts' ? 'Chars' : 'Tokens'}
              </span>
              <span className="font-code-dense text-code-dense text-outline">Processed Volume</span>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">ROUNDTRIP LATENCY</span>
              <span className="font-label-mono-sm text-label-mono-sm text-secondary mt-1 font-semibold font-mono">
                {log.latencyMs} ms
              </span>
              <span className="font-code-dense text-code-dense text-outline">Observed API latency</span>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
              <span className="font-code-dense text-code-dense text-outline uppercase font-semibold">KEY ID</span>
              <span className="font-label-mono-sm text-label-mono-sm text-tertiary mt-1 truncate font-semibold font-mono">
                {log.keyId || 'Key Pool'}
              </span>
              <span className="font-code-dense text-code-dense text-outline">Tier: {log.keyTier || 'standard'}</span>
            </div>
          </div>

          {/* Code Tabs */}
          <div className="flex flex-col gap-space-xs mt-space-xs">
            <div className="flex items-center gap-space-sm border-b border-outline-variant/30 pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('headers')}
                className={`font-code-dense text-code-dense pb-1 transition-colors cursor-pointer ${
                  activeTab === 'headers'
                    ? 'text-primary font-bold border-b-2 border-primary'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                TRACE HEADERS
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('params')}
                className={`font-code-dense text-code-dense pb-1 transition-colors cursor-pointer ${
                  activeTab === 'params'
                    ? 'text-primary font-bold border-b-2 border-primary'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                RECORD DETAILS
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('raw')}
                className={`font-code-dense text-code-dense pb-1 transition-colors cursor-pointer ${
                  activeTab === 'raw'
                    ? 'text-primary font-bold border-b-2 border-primary'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                FULL SQLITE ROW
              </button>
            </div>

            {/* Monospace Code Terminal */}
            <div className="relative bg-surface-container-lowest rounded-lg p-space-sm font-code-dense text-code-dense text-on-surface-variant overflow-x-auto shadow-inner border border-outline-variant/20">
              <pre className="leading-relaxed">
                <code>
                  {activeTab === 'headers' && JSON.stringify(traceHeaders, null, 2)}
                  {activeTab === 'params' && JSON.stringify(traceParams, null, 2)}
                  {activeTab === 'raw' && JSON.stringify(log, null, 2)}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
