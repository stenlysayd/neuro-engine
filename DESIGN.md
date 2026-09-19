---
name: Obsidian Telemetry
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-dense:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style
The design system embodies a high-density, mission-critical engineering aesthetic engineered for platform engineers, AI infra operators, and backend architects. It merges technical minimalism with subtle dark glassmorphism to project uncompromising precision, low cognitive friction, and absolute operational clarity. 

The emotional signature is calm, surgical, and authoritative under pressure. Interface elements prioritize scan-speed and visual economy over ornamental flair: crisp borders separate complex nested data, monospaced accents highlight cryptographic hashes and routing latencies, and high-contrast status beacons convey health states instantly. Visual noise is minimized to preserve developer focus across telemetry feeds, LLM token streams, and API gateway routing matrices.

## Colors
The palette is built around deep, light-absorbing obsidian foundations paired with high-luminance functional signals. 

- **Surface System:**
  - Base Canvas: `#0B0F17` (Deep Obsidian)
  - Elevated Container / Cards: `#111827` (Muted Slate Surface)
  - Floating Panels / Flyouts: `#1E293B` (Intermediary Slate)
  - Surface Stroke / Separators: `rgba(255, 255, 255, 0.08)` (Crisp Ghost Borders)

- **Semantic Telemetry Accents:**
  - **Active / Operational (Primary):** `#10B981` (Emerald) denotes operational endpoints, active model gateways, and valid keys.
  - **Telemetry / Stream (Secondary):** `#06B6D4` (Cyan) represents active data ingress/egress, token processing rates, and prompt routing paths.
  - **Exhausted / Rate-Limited (Tertiary):** `#F59E0B` (Amber) signals approaching quotas, high latency spikes, and fallback triggers.
  - **Error / Revoked:** `#F43F5E` (Rose) marks circuit breaker trips, failed authentications, and dead model endpoints.
  - **Disabled / Idle:** `#64748B` (Cool Slate) indicates inactive keys, paused pipelines, and archived routing rules.

## Typography
The typographic hierarchy implements a tripartite system:
1. **Plus Jakarta Sans** governs page titles, metric headers, and top-level operational modules to inject structural clarity and modern geometric grounding.
2. **Inter** handles narrative copy, explanatory descriptions, field labels, and tooltips, ensuring maximum legibility across dense configurations.
3. **JetBrains Mono** is the technical workhorse. All API keys, token counters, latency markers, CIDR blocks, HTTP status codes, and model identifiers must be rendered in this monospaced family with strict tabular figures (`tnum`).

## Layout & Spacing
The layout implements a rigid 12-column fluid grid system optimized for high-density dashboard displays.

- **Desktop (1280px+):** Fixed collapsible navigation rail (64px collapsed, 240px expanded), 12-column grid, 1rem (`gutter`) column separation, and 1.5rem (`margin`) outer perimeter spacing.
- **Tablet (768px - 1279px):** 8-column layout, compact guttering, sub-views reflow into 2-column or stacked vertical cards.
- **Mobile (< 768px):** Single-column stacked stream, 1rem margin, horizontal overflow scroll for tables and metrics cards.

Vertical rhythm is governed by a strict 4px base increment. Spacing within tabular rows and key-value monitors defaults to dense vertical margins (`space-xs` to `space-sm`) to maximize visible information density above the fold.

## Elevation & Depth
Depth is created through dark tonal layering and translucent glass surfaces rather than dramatic light drops. 

- **Level 0 (Base Canvas):** Solid `#0B0F17`.
- **Level 1 (Card & Module Layer):** Background `rgba(17, 24, 39, 0.75)`, paired with a `backdrop-filter: blur(12px)` and a crisp 1px border `rgba(255, 255, 255, 0.08)`.
- **Level 2 (Active Focus & Flyouts):** Background `#1E293B`, border `rgba(255, 255, 255, 0.14)`, and a diffused zero-spread dark shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.6)`.
- **Level 3 (Modals & Key Generation Drawers):** Background `#111827`, border `rgba(255, 255, 255, 0.2)`, with an edge highlight shadow: `0 20px 40px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05) inset`.

## Shapes
A controlled, technical "Soft" profile (`0.25rem` base border-radius) defines interactive components, avoiding playful rounded aesthetics in favor of instrumentation-grade angularity. 

- **Buttons, Inputs, Badges, and Code Blocks:** `0.25rem` (4px).
- **Cards, Modals, and Flyout Panels:** `rounded-lg` at `0.5rem` (8px).
- **Status Indicator Dots and Gateway Pings:** Fully circular (`rounded-full`).

## Components

### Buttons & Trigger Controls
- **Primary Action (e.g., "Create Secret Key", "Deploy Route"):** Solid Emerald (`#10B981`) fill, dark text (`#064E3B`), subtle inner highlight. Hover: `#059669`.
- **Secondary / Utility Action:** Transparent dark glass surface, border `rgba(255, 255, 255, 0.12)`, text `#E2E8F0`. Hover: `rgba(255, 255, 255, 0.05)` background, border `rgba(255, 255, 255, 0.24)`.
- **Destructive (e.g., "Revoke Key"):** Transparent background, border `rgba(244, 63, 94, 0.3)`, text `#FB7185`. Hover: `rgba(244, 63, 94, 0.15)`.
- **Height & Padding:** Compact 32px height for dashboard utility, `space-md` horizontal padding, labels in `label-mono-md`.

### Status Badges & Pill Beacons
- Composed of an optional 6px pulsing ping dot and an uppercase label formatted in `code-dense`.
- **Active:** Background `rgba(16, 185, 129, 0.12)`, text `#34D399`, border `rgba(16, 185, 129, 0.25)`.
- **Rate-Limited / Warning:** Background `rgba(245, 158, 11, 0.12)`, text `#FBBF24`, border `rgba(245, 158, 11, 0.25)`.
- **Error / Offline:** Background `rgba(244, 63, 94, 0.12)`, text `#FB7185`, border `rgba(244, 63, 94, 0.25)`.
- **Revoked / Inactive:** Background `rgba(100, 116, 139, 0.12)`, text `#94A3B8`, border `rgba(100, 116, 139, 0.25)`.

### High-Density Data Tables (Key & Route Inventories)
- **Header:** Sticky, uppercase `code-dense` tracking at `0.05em`, text `#64748B`, background `#0B0F17`, bottom border `rgba(255, 255, 255, 0.08)`.
- **Row:** Height 40px, cell padding `0 space-md`, alternating border `rgba(255, 255, 255, 0.04)`. Hover: `rgba(255, 255, 255, 0.02)`.
- **Key Display:** Truncated monospaced syntax (`sk_live_...4f8a`) with quick-action click-to-copy button and tooltip trigger.

### Input Fields & Secret Concealers
- Background `#0B0F17`, border 1px `rgba(255, 255, 255, 0.12)`, text `#F1F5F9`.
- Monospace mode enabled for routing weight numbers, regex paths, and tokens.
- Focus state: Border `#10B981` with zero shadow, providing immediate input fidelity.
- Concealed state: Masked character pills (`••••••••`) with inline toggle icon button.

### Model Routing Matrix Node Cards
- Elevated card containing model provider icon, latency mini-sparkline, fallback priority tier, and traffic split percentage (`label-mono-lg`).
- Interactive drag handles and direct percentage stepper inputs styled with muted border frames.
