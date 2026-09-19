import crypto from 'crypto';

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const GCM_IV_LENGTH = 12;
const CBC_IV_LENGTH = 16;
const FALLBACK_MASTER_KEY = 'default_master_key_must_be_32_bytes!';

function getMasterKey(): Buffer {
  const rawKey = process.env.NEURO_MASTER_KEY || process.env.MASTER_KEY || FALLBACK_MASTER_KEY;
  return crypto.createHash('sha256').update(rawKey).digest();
}

export function encryptKey(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['gcm', iv.toString(ENCODING), tag.toString(ENCODING), encrypted.toString(ENCODING)].join(':');
}

export function decryptKey(text: string): string {
  if (!text.includes(':')) {
    return text;
  }

  try {
    const parts = text.split(':');

    if (parts[0] === 'gcm') {
      const [, ivHex, tagHex, encryptedHex] = parts;
      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getMasterKey(), Buffer.from(ivHex, ENCODING));
      decipher.setAuthTag(Buffer.from(tagHex, ENCODING));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, ENCODING)),
        decipher.final()
      ]);
      return decrypted.toString('utf8');
    }

    const legacyKey = Buffer.from((process.env.MASTER_KEY || FALLBACK_MASTER_KEY).substring(0, 32));
    const iv = Buffer.from(parts.shift()!, ENCODING);
    const encryptedText = Buffer.from(parts.join(':'), ENCODING);
    const decipher = crypto.createDecipheriv(CBC_ALGORITHM, legacyKey, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
  } catch {
    return text;
  }
}

export function fingerprintSecret(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function maskSecret(secret: string): string {
  if (!secret) {
    return 'empty';
  }

  if (/^https?:\/\//i.test(secret)) {
    try {
      const url = new URL(secret);
      return `${url.protocol}//${url.host}`;
    } catch {
      return 'local-endpoint';
    }
  }

  if (secret.length <= 12) {
    return `${secret.slice(0, 2)}...${secret.slice(-2)}`;
  }

  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
}
