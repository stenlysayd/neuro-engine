# Contributing to Neuro Engine

Thank you for contributing to Neuro Engine! This guide provides everything you need to get up and running with the monorepo architecture.

---

## 🏛️ Monorepo Architecture

The repository is structured as a **pnpm workspace** divided into modular packages:

```
packages/
├── core/         # Shared TypeScript interfaces, AES-256 cryptographic helpers, EventBus
├── memory/       # SQLite persistent storage layer, migrations, configuration models
├── key-pool/     # Cryptographic key leasing, rate limit cooldown, rotation, health checks
├── brain-router/ # Multi-provider LLM cascading engine (OpenAI, Anthropic, Gemini, Groq, Local)
├── tts-router/   # Multi-provider TTS router with sentence chunking & ID3 header stripping
├── api/          # Express REST API & WebSocket server for real-time telemetry streaming
└── dashboard/    # Vite + React 19 operational monitoring dashboard
```

---

## 🚀 Development Setup

### Prerequisites
- **Node.js**: v20.x or v22.x
- **pnpm**: v9.x (`npm install -g pnpm`)

### Installation & Build
```bash
# Clone the repository
git clone https://github.com/stenlysayd/neuro-engine.git
cd neuro-engine

# Install dependencies across all packages
pnpm install

# Build all packages in dependency order
pnpm run build
```

### Running Locally
You can run the API server and Dashboard simultaneously:

```bash
# Terminal 1: Start the backend headless API
pnpm --filter @neuro/api start

# Terminal 2: Start the frontend telemetry dashboard
pnpm --filter @neuro/dashboard dev
```

The dashboard will be available at `http://localhost:5173` and automatically connect to the API on `http://localhost:3001` via REST and WebSockets.

---

## 🧩 Adding a New LLM Provider

To add a new LLM provider:
1. Open `packages/brain-router/src/adapters.ts`.
2. Implement the `BrainAdapter` interface from `@neuro/core`:
   ```ts
   export class MyCustomAdapter implements BrainAdapter {
     provider = 'my-provider';
     async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
       // Implementation
     }
     countTokens(input: ChatInput): number {
       // Token approximation
     }
   }
   ```
3. Register your adapter in `packages/brain-router/src/index.ts`.
4. Rebuild the package with `pnpm --filter @neuro/brain-router build`.

---

## 📋 Pull Request Guidelines

1. Create a descriptive feature branch: `git checkout -b feature/my-enhancement`.
2. Ensure the entire monorepo builds cleanly: `pnpm run build`.
3. Never include unencrypted secrets or commit `.db` files.
4. Submit your pull request with a concise explanation of changes and verification steps.

## 📄 License
By contributing, you agree that your code will be licensed under the [MIT License](LICENSE).
