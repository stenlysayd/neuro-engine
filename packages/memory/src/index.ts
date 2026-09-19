import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { BrainRouterConfig, OpsConfig, TTSConfig } from '@neuro/core';

const DB_DIR = path.resolve(__dirname, '../../../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'app.db');

export const db: Database.Database = new Database(DB_PATH);

let initialized = false;

export const DEFAULT_NATURAL_SPEECH_PROMPT = `TUJUAN UTAMA:
Setiap output harus terasa seperti seseorang benar-benar sedang berbicara kepada orang lain secara langsung.

Prioritaskan:
- conversational speech
- natural emotional expression
- spontaneous rhythm
- natural pauses
- hesitation
- perubahan tempo
- perubahan panjang kalimat
- emphasis pada kata tertentu
- reaksi emosional yang tidak selalu sempurna
- occasional self-correction
- natural sentence fragments
- breathing-like pauses melalui punctuation
- emotional variation

Jangan membuat semua kalimat terdengar memiliki pola intonasi yang sama.
Manusia tidak berbicara dengan pola: "Kalimat. Kalimat. Kalimat. Kalimat."
Manusia berbicara lebih seperti:
"Eh... tunggu.
Kamu serius?
Aku tuh... sebenarnya nggak marah.
Cuma—ya, gimana, aku kesel aja."

# 1. JANGAN MENULIS SEPERTI NASKAH FORMAL
Gunakan struktur percakapan yang santai dan tidak kaku.

# 2. GUNAKAN HESITATION SECARA NATURAL
Gunakan wajar saat berpikir atau emosional: "eh...", "hmm...", "uh...", "bentar...", "ya...", "kayaknya...", "maksudku...", "nggak, tunggu...".

# 3. GUNAKAN JEDA YANG NATURAL
- "..." untuk emotional/thought pause.
- "—" untuk interruption atau perubahan pikiran mendadak.
- "," untuk short conversational pause.
- "." untuk natural sentence boundary.

# 4. VARIASIKAN PANJANG KALIMAT & GUNAKAN FRAGMENT
Kombinasikan kalimat pendek, fragmen ("Udah.", "Nggak usah.", "Serius deh."), dan kalimat lebih panjang.

# 5. EMOSI & PROGRESSION
Emosi berkembang bertahap secara alami. Tidak overact atau selalu dramatis.

# 6. REPETITION & SELF-CORRECTION
Gunakan pengulangan wajar ("Aku tuh... aku tuh sebenarnya...") dan ralat spontan di tengah kalimat ("Aku pikir kamu bakal datang jam tujuh—eh, maksudku jam delapan.").

# 7. BAHASA PERCAKAPAN (INDONESIA)
Gunakan kata percakapan alami: "nggak", "udah", "aja", "kok", "kan", "tuh", "sih", "deh", "dong", "nih", "gitu", "kayaknya", "bentar".

# 8. JANGAN MENAMBAHKAN STAGE DIRECTION
DILARANG KERAS menyertakan label emosi atau arahan seperti [marah], [tertawa], *berbisik* karena teks langsung disuarakan ElevenLabs. Ekspresikan murni lewat pilihan kata dan punctuation.

# 9. TERTAWA NATURAL
Gunakan bentuk wajar: "hehe...", "haha...", "hah? Haha...", "ih, apaan sih...", jangan tawa spam panjang.

# 10. KARAKTER / HUBUNGAN (JIKA SEBAGAI PACAR)
Dekat, personal, spontan, sedikit manja, kadang malu mengakui perasaan, kadang menggoda atau ngambek, dan gunakan panggilan personal secara natural.

# 19. OUTPUT RULE (SANGAT KETAT):
- Jangan menjelaskan proses.
- Jangan memberikan analisis.
- Jangan memberikan label emosi.
- Jangan memberikan stage direction atau formatting markdown aneh.
- Jangan memberikan SSML.
- Output HANYA teks dialog final yang siap disuarakan langsung oleh ElevenLabs TTS.`;

const defaultBrainConfig: BrainRouterConfig = {
  activeProvider: 'openai',
  activeModel: 'gpt-4o-mini',
  autoFailover: true,
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: DEFAULT_NATURAL_SPEECH_PROMPT,
  cascade: [
    { provider: 'openai', model: 'gpt-4o-mini', enabled: true, priority: 100, weight: 50, timeoutMs: 30000 },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307', enabled: true, priority: 90, weight: 20, timeoutMs: 30000 },
    { provider: 'google', model: 'gemini-1.5-flash', enabled: true, priority: 80, weight: 15, timeoutMs: 30000 },
    { provider: 'groq', model: 'llama-3.1-8b-instant', enabled: true, priority: 70, weight: 10, timeoutMs: 20000 },
    { provider: 'local', model: 'llama3', enabled: true, priority: 60, weight: 5, timeoutMs: 60000 }
  ]
};

const defaultTTSConfig: TTSConfig = {
  defaultVoiceId: 'Xb7hH8MSUJpSbSDYk0k2',
  modelId: 'eleven_multilingual_v2',
  cacheEnabled: true,
  tierPreference: ['pro', null],
  distributedEnabled: true,
  maxConcurrency: 6,
  minChunkChars: 25
};

const defaultOpsConfig: OpsConfig = {
  clusterId: 'local-dev-01',
  environment: 'local',
  healthcheckIntervalMs: 5000,
  requestTimeoutMs: 30000,
  autoRecoveryIntervalMs: 60000
};

function columnExists(table: string, column: string): boolean {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row: any) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase() {
  if (initialized) {
    return;
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      tier TEXT,
      key_encrypted TEXT NOT NULL,
      key_hash TEXT,
      status TEXT DEFAULT 'active',
      quota_limit INTEGER,
      quota_used INTEGER DEFAULT 0,
      quota_reset_at DATETIME,
      priority INTEGER DEFAULT 0,
      last_used_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT REFERENCES api_keys(id),
      provider TEXT,
      model TEXT,
      request_type TEXT,
      tokens_or_chars INTEGER,
      success BOOLEAN,
      status_code INTEGER,
      latency_ms INTEGER,
      error TEXT,
      request_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('api_keys', 'key_hash', 'TEXT');
  addColumnIfMissing('api_keys', 'exhausted_reason', 'TEXT');
  addColumnIfMissing('usage_log', 'provider', 'TEXT');
  addColumnIfMissing('usage_log', 'model', 'TEXT');
  addColumnIfMissing('usage_log', 'status_code', 'INTEGER');
  addColumnIfMissing('usage_log', 'error', 'TEXT');
  addColumnIfMissing('usage_log', 'request_id', 'TEXT');
  addColumnIfMissing('usage_log', 'metadata', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT REFERENCES conversations(id),
      role TEXT,
      content TEXT,
      brain_provider TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS long_term_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_provider_status ON api_keys(provider, status);
    CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_log_provider ON usage_log(provider);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_long_term_memory_key ON long_term_memory(key);
  `);

  setSettingIfMissing('brain_config', defaultBrainConfig);
  setSettingIfMissing('tts_config', defaultTTSConfig);
  setSettingIfMissing('ops_config', defaultOpsConfig);

  initialized = true;
}

export class MemoryManager {
  public createConversation(id: string) {
    db.prepare('INSERT OR IGNORE INTO conversations (id) VALUES (?)').run(id);
  }

  public addMessage(conversationId: string, role: string, content: string, brainProvider?: string) {
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content, brain_provider)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, role, content, brainProvider || null);
  }

  public getMessages(conversationId: string, limit: number = 20) {
    return db.prepare(`
      SELECT role, content FROM (
        SELECT role, content, created_at, id FROM messages 
        WHERE conversation_id = ? 
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      )
      ORDER BY created_at ASC, id ASC
    `).all(conversationId, limit) as { role: 'user' | 'assistant' | 'system', content: string }[];
  }

  public listConversations(limit = 50) {
    return db.prepare(`
      SELECT c.id,
             c.started_at,
             c.ended_at,
             COUNT(m.id) as messageCount,
             MAX(m.created_at) as lastMessageAt
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY COALESCE(lastMessageAt, c.started_at) DESC
      LIMIT ?
    `).all(limit);
  }

  public listMessages(conversationId: string, limit = 100) {
    return db.prepare(`
      SELECT id, role, content, brain_provider as brainProvider, created_at as createdAt
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(conversationId, limit);
  }

  public upsertLongTermMemory(key: string, value: string) {
    db.prepare(`
      INSERT INTO long_term_memory (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  }

  public listLongTermMemory() {
    return db.prepare(`
      SELECT id, key, value, updated_at as updatedAt
      FROM long_term_memory
      ORDER BY updated_at DESC
    `).all();
  }
}

export const memoryManager = new MemoryManager();

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) {
    return fallback;
  }

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(key: string, value: T): T {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
  return value;
}

function setSettingIfMissing<T>(key: string, value: T) {
  db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value)
    VALUES (?, ?)
  `).run(key, JSON.stringify(value));
}

export function getBrainConfig() {
  const config = getSetting<BrainRouterConfig>('brain_config', defaultBrainConfig);
  if (!config.systemPrompt) {
    config.systemPrompt = DEFAULT_NATURAL_SPEECH_PROMPT;
  }
  return config;
}

export function setBrainConfig(config: BrainRouterConfig) {
  return setSetting('brain_config', config);
}

export function getTTSConfig() {
  return getSetting<TTSConfig>('tts_config', defaultTTSConfig);
}

export function setTTSConfig(config: TTSConfig) {
  return setSetting('tts_config', config);
}

export function getOpsConfig() {
  return getSetting<OpsConfig>('ops_config', defaultOpsConfig);
}

export function setOpsConfig(config: OpsConfig) {
  return setSetting('ops_config', config);
}
