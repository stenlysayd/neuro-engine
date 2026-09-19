import type { FC } from 'react';
import { NavLink } from 'react-router-dom';
import type { DashboardSnapshot } from '../../api';

interface SidebarProps {
  snapshot: DashboardSnapshot;
}

const navLinks = [
  { path: '/key-pools', label: 'Key Pools', icon: 'vpn_key' },
  { path: '/brain-router', label: 'Brain Router', icon: 'neurology' },
  { path: '/usage-logs', label: 'Usage Logs', icon: 'reorder' },
  { path: '/telemetry', label: 'Telemetry', icon: 'monitoring' },
  { path: '/settings', label: 'Settings', icon: 'tune' },
];

export const Sidebar: FC<SidebarProps> = ({ snapshot }) => {
  const clusterId = snapshot.opsConfig.clusterId || 'us-east-prod-04';
  const healthPercent = snapshot.telemetry.healthPercent.toFixed(3);

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col justify-between py-space-md border-r border-outline-variant/30">
      <div className="flex flex-col gap-space-md">
        {/* Brand Header */}
        <div className="flex items-center gap-space-sm px-space-md">
          <div className="h-7 w-7 rounded-lg bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[18px]">terminal</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-on-surface leading-none font-bold">CORE-OPS</span>
            <span className="font-code-dense text-code-dense text-outline tracking-wider uppercase">v2.4.9-telemetry</span>
          </div>
        </div>

        {/* Cluster Badge */}
        <div className="px-space-md py-space-xs bg-surface-container-low mx-space-sm rounded-lg flex items-center justify-between">
          <span className="font-code-dense text-code-dense text-on-surface-variant uppercase">CLUSTER ID</span>
          <span className="font-label-mono-sm text-label-mono-sm text-primary font-semibold">{clusterId}</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-space-xs px-space-sm">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-colors font-label-mono-md text-label-mono-md ${
                  isActive
                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                }`
              }
            >
              <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer Metrics */}
      <div className="flex flex-col gap-space-xs px-space-sm">
        <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
          <div className="flex items-center justify-between">
            <span className="font-code-dense text-code-dense text-on-surface-variant uppercase">UPTIME</span>
            <span className="font-label-mono-sm text-label-mono-sm text-primary">{healthPercent}%</span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-500"
              style={{ width: `${Math.min(100, snapshot.telemetry.healthPercent)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-space-sm py-space-xs text-on-surface-variant font-code-dense text-code-dense">
          <span>SESSION AGENT</span>
          <span className="text-outline">SEC-TOK-491A</span>
        </div>
      </div>
    </aside>
  );
};
