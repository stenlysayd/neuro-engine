# Implementation Plan — Fondasi Aplikasi AI Streamer (Neuro-sama-like)

## 1. Ringkasan & Tujuan

Membangun **fondasi** aplikasi yang nantinya akan dikembangkan bertahap menjadi AI streamer/vtuber seperti Neuro-sama (Vedal). Fondasi ini harus:

- Bisa berbicara (TTS) lewat ElevenLabs, dengan 1 API key tier Pro sebagai utama + puluhan API key berbagai tier sebagai backup/failover.
- Punya "otak" (LLM) yang **bisa di-switch bebas** antar LLM lokal maupun API pihak ketiga (OpenAI, Anthropic, Google AI, Groq, dll), dengan **multi-slot API key** per provider (ratusan key tersedia).
- Mendukung mode **agentic** di mana beberapa "otak" bekerja sama menjawab satu prompt untuk efisiensi token/kualitas jawaban.
- Menyimpan **context & memory secara lokal** dan persisten antar sesi.
- Cukup modular sehingga fitur-fitur berikutnya (STT, animasi avatar, baca chat stream, dsb.) tinggal dicolok ke fondasi ini tanpa membangun ulang core-nya.

Dokumen ini **tidak** membahas UI/visual (akan dibuat terpisah di Stitch sebagai `design.md`). Fokus di sini murni pada arsitektur backend, struktur data, dan strategi implementasi.

## 2. Keputusan Fondasi

| Aspek | Keputusan |
|---|---|
| Bahasa/Runtime | Node.js + TypeScript |
| Database lokal | SQLite |
| Bentuk aplikasi (rekomendasi) | Backend service headless (lihat §3) + dashboard web lokal minimal untuk monitoring/switching |

## 3. Rekomendasi Bentuk Aplikasi

Karena tujuan akhir adalah integrasi ke stream (OBS, dsb.) tapi kamu juga butuh kontrol manual (switch otak, cek kuota API, dsb.) selama development, rekomendasinya:

**Backend service (Node/TypeScript) headless** yang expose:
- **REST API** — untuk kontrol (switch brain, cek status key, trigger TTS manual, dsb.)
- **WebSocket** — untuk streaming event real-time (transkrip, respons LLM per-token, status TTS) ke consumer (OBS overlay, dashboard, dsb.)
- **Dashboard web lokal minimal** (bisa React/Vite atau bahkan HTML statis + fetch) khusus untuk monitoring: sisa kuota tiap API key, key mana yang lagi dipakai, log request/response, tombol manual switch otak.

Alasan: Electron/Tauri baru masuk akal kalau kamu butuh window native yang tampil ke penonton (misal avatar). Untuk fondasi, headless service + dashboard web jauh lebih ringan untuk diiterasi, dan tetap bisa dibungkus jadi desktop app atau OBS Browser Source kapan saja nanti tanpa refactor besar.

## 4. Arsitektur Tingkat Tinggi

```
                         ┌─────────────────────────┐
 Input (chat/teks/STT) ─▶│      Orchestrator/Core    │
                         │  (event pipeline & state) │
                         └───────────┬───────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                    ▼
        ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
        │  Memory Module   │  │  Brain Router   │  │   TTS Router     │
        │  (SQLite)        │  │  (multi-LLM)    │  │  (multi-ElevenLabs)│
        └────────────────┘  └───────┬────────┘  └─────────┬────────┘
                                     │                      │
                          ┌──────────┴─────────┐            ▼
                          ▼                     ▼      Audio Output
                  Provider Adapters      Agentic Coordinator
                (OpenAI/Anthropic/          (opsional, multi-
                 Google/Groq/Local)          brain kolaborasi)

        ┌───────────────────────────────────────────────┐
        │        Key Pool Manager (shared service)        │
        │  - tracking kuota/rate limit tiap key            │
        │  - rotasi & failover                             │
        │  - dipakai oleh Brain Router & TTS Router         │
        └───────────────────────────────────────────────┘
```

Semua modul komunikasi lewat **event bus internal** (bisa pakai `EventEmitter` Node built-in dulu di fondasi ini, upgrade ke message queue kalau nanti butuh multi-proses).

## 5. Struktur Proyek (Monorepo)

```
neuro-app/
├── packages/
│   ├── core/                # Orchestrator, event bus, tipe/interface bersama
│   ├── key-pool/             # Key Pool Manager (generic, dipakai brain & tts)
│   ├── brain-router/          # Router LLM + provider adapters
│   │   ├── adapters/
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── google.ts
│   │   │   ├── groq.ts
│   │   │   └── local.ts       # Ollama/llama.cpp/dsb.
│   │   └── agentic/           # Koordinator multi-brain
│   ├── tts-router/            # Router ElevenLabs multi-key
│   ├── memory/                # SQLite access layer + migration
│   ├── api/                   # REST + WebSocket server (Fastify/Express)
│   └── dashboard/             # Web dashboard minimal (opsional di fondasi awal)
├── data/
│   └── app.db                 # SQLite database
├── config/
│   └── keys.enc.json          # API keys terenkripsi (lihat §9)
├── .env                        # secrets non-key (encryption master key, dsb.)
└── package.json                # workspaces (monorepo)
```

Pakai **pnpm workspaces** atau **Turborepo** supaya tiap modul (`brain-router`, `tts-router`, dst.) punya boundary jelas dan bisa dites/diganti sendiri-sendiri tanpa mengganggu modul lain — ini penting karena kamu bilang "tidak perlu membuat dasar lagi" untuk fitur berikutnya.

## 6. Key Pool Manager (fondasi paling kritis)

Karena kamu akan pakai **puluhan key ElevenLabs** dan **ratusan key LLM**, ini harus jadi service generic yang dipakai ulang oleh Brain Router maupun TTS Router — bukan logic terpisah-pisah.

### Skema data (SQLite)

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,        -- 'elevenlabs' | 'openai' | 'anthropic' | 'google' | 'groq' | 'local'
  tier TEXT,                     -- 'pro' | 'free' | 'creator' | dst (khusus elevenlabs)
  key_encrypted TEXT NOT NULL,
  status TEXT DEFAULT 'active',  -- 'active' | 'exhausted' | 'error' | 'disabled'
  quota_limit INTEGER,           -- karakter/token/request, tergantung provider
  quota_used INTEGER DEFAULT 0,
  quota_reset_at DATETIME,
  priority INTEGER DEFAULT 0,    -- urutan preferensi dalam provider yg sama
  last_used_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT REFERENCES api_keys(id),
  request_type TEXT,             -- 'tts' | 'chat_completion'
  tokens_or_chars INTEGER,
  success BOOLEAN,
  latency_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Perilaku inti

- **Selection strategy**: pilih key `active` dengan `priority` tertinggi & `quota_used < quota_limit` dalam provider/tier yang diminta.
- **Failover otomatis**: begitu request gagal karena rate-limit/quota (403/429 dari provider), tandai key `exhausted`, catat `quota_reset_at` (kalau providernya kasih info), lalu **retry otomatis** ke key berikutnya dalam pool — tanpa mengganggu flow di Brain/TTS Router.
- **Auto-recovery**: job berkala (mis. tiap X menit) cek key yang `exhausted`/`quota_reset_at` sudah lewat → kembalikan ke `active`.
- **Manual override**: endpoint API untuk disable/enable key tertentu secara manual dari dashboard.

Ini membuat Brain Router dan TTS Router tinggal panggil `keyPool.acquire(provider, tier?)` tanpa peduli detail rotasi — jadi kalau nanti nambah provider baru, tidak perlu bikin ulang logic failover.

## 7. Brain Router (Multi-LLM)

### Interface adapter generic

```ts
interface BrainAdapter {
  provider: string;
  chat(input: ChatInput, key: ApiKey): Promise<ChatOutput>;
  streamChat?(input: ChatInput, key: ApiKey): AsyncIterable<ChatChunk>;
  countTokens(input: ChatInput): number;
}
```

Setiap provider (OpenAI, Anthropic, Google, Groq, Local) implement interface yang sama → Router tidak peduli provider mana yang dipakai, tinggal panggil `adapter.chat(...)`.

### Mode operasi

1. **Manual switch** — kamu pilih provider/model aktif lewat dashboard/API (`POST /brain/active { provider, model }`). Ini mode paling sederhana, cocok untuk fondasi tahap awal.
2. **Auto-failover** — kalau brain aktif kena limit, Router otomatis pindah ke brain fallback berikutnya sesuai urutan yang kamu set (mirip Key Pool tapi di level provider, bukan cuma key).
3. **Agentic multi-brain** (dikembangkan setelah fondasi solid) — beberapa strategi yang bisa dipilih nanti:
   - **Router kecil dulu**: model kecil/murah (mis. Groq/local) menilai kompleksitas prompt → kalau sederhana dijawab sendiri, kalau kompleks di-forward ke model besar (hemat token).
   - **Ensemble/voting**: beberapa brain jawab pertanyaan yang sama, satu brain "juri" memilih/menggabungkan jawaban terbaik.
   - **Pipeline peran**: brain A untuk ekstraksi intent, brain B untuk generate respons, brain C untuk gaya bahasa/persona — tiap brain bisa provider berbeda.

Untuk fondasi, cukup bangun mode 1 & 2 dulu (interface adapter + router + failover), lalu siapkan `agentic/` sebagai folder kosong dengan interface `AgenticStrategy` supaya gampang ditambah nanti tanpa ubah Router inti.

## 8. TTS Router (Multi-ElevenLabs)

Pola sama seperti Brain Router, tapi lebih sederhana karena provider tunggal (ElevenLabs) dengan banyak key/tier:

- `ttsRouter.speak(text, voiceId)` → ambil key dari Key Pool (prioritas: tier Pro dulu, baru backup) → panggil ElevenLabs API → kalau gagal karena limit, otomatis pindah key berikutnya.
- Simpan **cache audio** untuk teks yang identik (opsional, hemat kuota kalau ada respons berulang).
- Sediakan hook `onAudioReady(buffer)` yang nanti dikonsumsi modul lain (audio player lokal, stream ke OBS, dsb.) — supaya fitur output (misal lip-sync avatar) tinggal subscribe event ini di masa depan.

## 9. Manajemen Secrets (API Keys)

- Key **tidak** disimpan plaintext. Enkripsi (AES-256) sebelum masuk kolom `key_encrypted`, dengan **master key** disimpan di `.env` (yang di-gitignore).
- Import key massal: buat script `scripts/import-keys.ts` yang baca file (CSV/JSON) berisi daftar key + provider + tier, lalu enkripsi & insert ke `api_keys` — supaya onboarding ratusan key tidak perlu manual satu-satu.
- Dashboard hanya menampilkan key dalam bentuk masked (`sk-...ab12`), tidak pernah full key.

## 10. Memory & Context (SQLite)

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT REFERENCES conversations(id),
  role TEXT,                 -- 'user' | 'assistant' | 'system'
  content TEXT,
  brain_provider TEXT,       -- provider yang menjawab (untuk audit)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE long_term_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT,                  -- mis. 'user_name', 'preferensi_topik'
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- **Short-term context**: N pesan terakhir dari `messages` dalam `conversation_id` aktif, dipakai sebagai context window ke Brain Router.
- **Long-term memory**: fakta ringkas (bukan raw chat) yang di-extract berkala oleh salah satu brain, disimpan di `long_term_memory` — ini fondasi untuk nanti kalau mau upgrade ke semantic/vector memory (tinggal tambah kolom embedding atau tabel baru, tidak perlu redesign skema).

## 11. Roadmap Bertahap

| Fase | Fokus |
|---|---|
| **Fase 0 — Fondasi (ini)** | Key Pool Manager, Brain Router (manual switch + failover), TTS Router (multi-key ElevenLabs), Memory (SQLite short-term), REST API dasar |
| **Fase 1** | Dashboard monitoring (kuota key, log usage, switch manual dari UI), auto-recovery key |
| **Fase 2** | Agentic strategy pertama (router kecil→besar untuk hemat token), long-term memory extraction |
| **Fase 3** | Integrasi STT (input suara), event WebSocket untuk konsumsi OBS/overlay |
| **Fase 4** | Fitur "kepribadian"/persona, baca chat live stream, kontrol avatar (di luar scope dokumen ini) |

## 12. Prinsip Desain yang Dipegang di Fondasi

- **Local-first**: semua state (memory, key metadata, usage log) di SQLite lokal, tidak bergantung layanan cloud pihak ketiga selain LLM/TTS API itu sendiri.
- **Provider-agnostic**: Brain Router & TTS Router tidak pernah hardcode logic spesifik provider di luar folder `adapters/`.
- **Fail-safe by default**: setiap pemanggilan API luar (LLM/TTS) wajib lewat Key Pool Manager, tidak ada pemanggilan langsung tanpa failover.
- **Observability sejak awal**: setiap request (brain & tts) dicatat ke `usage_log` — penting untuk mengelola ratusan key secara sehat.
- **Extensible tanpa refactor**: nambah provider baru = nambah 1 file adapter + entry di config, bukan ubah Router inti.

## 13. Hal yang Perlu Diputuskan Selanjutnya (di luar fondasi ini)

- Format import key massal (CSV kolom apa saja) — bisa disiapkan begitu kamu mulai isi data.
- Strategi persona/system prompt dasar untuk brain (akan lebih relevan begitu masuk Fase 2–4).
- Pilihan LLM lokal (Ollama? llama.cpp? model apa) kalau slot "local" mau benar-benar dipakai di Fase 0/1.
