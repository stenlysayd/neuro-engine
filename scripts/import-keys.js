const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = path.resolve(__dirname, '../data/app.db');
const db = new Database(DB_PATH);

const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const IV_LENGTH = 16;
const MASTER_KEY = process.env.MASTER_KEY || 'default_master_key_must_be_32_bytes!'.substring(0, 32);

function encryptKey(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(MASTER_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString(ENCODING) + ':' + encrypted.toString(ENCODING);
}

// Expects a JSON file like:
// [ { "provider": "openai", "tier": "pro", "key": "sk-123..." } ]
const importFile = process.argv[2];

if (!importFile) {
  console.log('Usage: node import-keys.js <path_to_json_file>');
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(importFile, 'utf8'));
  const stmt = db.prepare(`
    INSERT INTO api_keys (id, provider, tier, key_encrypted, status, priority, quota_limit)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `);
  
  let count = 0;
  for (const item of data) {
    const id = crypto.randomUUID();
    const encrypted = encryptKey(item.key);
    stmt.run(
      id,
      item.provider,
      item.tier || 'free',
      encrypted,
      item.priority || 1,
      item.quota_limit || null
    );
    count++;
  }
  
  console.log(`Successfully imported and encrypted ${count} keys.`);
} catch (e) {
  console.error('Failed to import keys:', e);
}
