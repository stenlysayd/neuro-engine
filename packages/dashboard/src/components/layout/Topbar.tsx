import type { FC } from 'react';
import { type DashboardSnapshot, formatNumber, labelForProvider } from '../../api';

interface TopbarProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
  isSyncing?: boolean;
}

export const Topbar: FC<TopbarProps> = ({ snapshot, onRefresh, isSyncing }) => {
  const clusterId = snapshot.opsConfig.clusterId || 'us-east-prod-04';
  const activeKeys = snapshot.telemetry.keys.active;
  const healthPercent = snapshot.telemetry.healthPercent.toFixed(1);
  const throughput = snapshot.telemetry.usage.throughput.toFixed(1);
  const activeBrain = `${labelForProvider(snapshot.telemetry.activeBrain.provider)} ${snapshot.telemetry.activeBrain.model}`;
  const env = (snapshot.opsConfig.environment || 'PRODUCTION-US-EAST').toUpperCase();

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.2)] z-40 flex items-center justify-between px-margin border-b border-outline-variant/30">
      {/* Left Key Metric Chips */}
      <div className="flex items-center gap-space-lg">
        <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-low rounded-lg">
          <span className="font-code-dense text-code-dense text-outline uppercase">CLUSTER</span>
          <span className="font-label-mono-sm text-label-mono-sm text-primary font-semibold">{clusterId}</span>
        </div>
        <div className="flex items-center gap-space-xs">
          <span className="font-code-dense text-code-dense text-outline uppercase">KEYS</span>
          <span className="font-label-mono-md text-label-mono-md text-on-surface font-semibold">
            {formatNumber(activeKeys)} ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-space-xs">
          <span className="font-code-dense text-code-dense text-outline uppercase">HEALTH</span>
          <div className="flex items-center gap-space-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="font-label-mono-md text-label-mono-md text-primary font-semibold">
              {healthPercent}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-xs">
          <span className="font-code-dense text-code-dense text-outline uppercase">THROUGHPUT</span>
          <span className="font-label-mono-md text-label-mono-md text-secondary font-semibold">
            {throughput} req/s
          </span>
        </div>
        <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-low rounded-lg">
          <span className="material-symbols-outlined text-tertiary text-[14px]">smart_toy</span>
          <span className="font-code-dense text-code-dense text-outline uppercase">BRAIN:</span>
          <span className="font-label-mono-sm text-label-mono-sm text-tertiary font-semibold truncate max-w-[180px]">
            {activeBrain}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-space-md">
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
          title="Force Sync / Refresh"
        >
          <span className={`material-symbols-outlined text-[16px] ${isSyncing ? 'animate-spin' : ''}`}>
            sync
          </span>
        </button>
        <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-surface-container-low">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="font-code-dense text-code-dense text-on-surface uppercase">LIVE 5S</span>
        </div>
        <div className="px-space-sm py-space-xs rounded-lg bg-surface-container-high text-on-surface-variant font-code-dense text-code-dense uppercase">
          ENV: {env}
        </div>
        <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-surface-container-high border-0">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[14px]">person</span>
          </div>
          <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-medium">Admin</span>
        </div>
      </div>
    </header>
  );
};
