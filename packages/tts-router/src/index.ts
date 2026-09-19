import { KeyPoolManager } from '@neuro/key-pool';
import { EventBus } from '@neuro/core';
import { getTTSConfig } from '@neuro/memory';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.resolve(__dirname, '../../../data/audio-cache');

/**
 * Split text into natural sentence/clause chunks.
 * Handles abbreviations and keeps sentence rhythm smooth.
 */
export function splitIntoSentences(text: string, minChars = 25): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split on sentence boundaries (. ! ? … \n ; :) followed by whitespace
  const rawChunks = trimmed
    .split(/(?<=[.!?…\n;:])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (rawChunks.length <= 1) {
    return [trimmed];
  }

  // Merge overly short chunks (e.g. "Ya.", "Tentu saja.") to maintain natural cadence
  const merged: string[] = [];
  let current = '';

  for (const chunk of rawChunks) {
    if (!current) {
      current = chunk;
    } else if (current.length < minChars || chunk.length < 15) {
      current = `${current} ${chunk}`;
    } else {
      merged.push(current);
      current = chunk;
    }
  }

  if (current) {
    if (merged.length > 0 && current.length < minChars) {
      merged[merged.length - 1] += ` ${current}`;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Strip ID3v2 metadata header (10+ bytes) and ID3v1 trailer (128 bytes)
 * from MP3 chunks so frames can be concatenated seamlessly without glitching audio players.
 */
export function stripMp3Metadata(buffer: Buffer): Buffer {
  let start = 0;
  let end = buffer.length;

  // Check for ID3v2 header: 'ID3' (0x49 0x44 0x33)
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7f) << 21) |
                 ((buffer[7] & 0x7f) << 14) |
                 ((buffer[8] & 0x7f) << 7)  |
                 (buffer[9] & 0x7f);
    const headerSize = 10 + size;
    if (headerSize < buffer.length) {
      start = headerSize;
    }
  }

  // Check for ID3v1 footer: 'TAG' (0x54 0x41 0x47) at the end
  if (end - start >= 128 &&
      buffer[end - 128] === 0x54 &&
      buffer[end - 127] === 0x41 &&
      buffer[end - 126] === 0x47) {
    end -= 128;
  }

  return buffer.subarray(start, end);
}

/**
 * Stitch multiple MP3 buffers into a continuous seamless stream.
 */
export function concatenateMp3Buffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0];

  const cleaned = buffers.map(stripMp3Metadata);
  return Buffer.concat(cleaned);
}

/**
 * Query ElevenLabs subscription to check character count, reset unix, and status.
 */
async function checkElevenLabsSubscription(secret: string): Promise<{
  resetAt: Date | null;
  isPermanent: boolean;
  reason: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': secret.trim() },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { resetAt: null, isPermanent: true, reason: `HTTP ${res.status}` };
    }

    const data: any = await res.json();
    const isFreeDisabled = data.status === 'free_disabled';
    const nextResetUnix = Number(data.next_character_count_reset_unix);
    const nowUnix = Math.floor(Date.now() / 1000);

    // If future reset date exists and tier is not permanently disabled
    if (!isFreeDisabled && nextResetUnix && nextResetUnix > nowUnix) {
      return {
        resetAt: new Date(nextResetUnix * 1000),
        isPermanent: false,
        reason: `${data.tier || 'Standard'} tier reset`
      };
    }

    // No future reset rollover schedule or permanently disabled
    return {
      resetAt: null,
      isPermanent: true,
      reason: isFreeDisabled ? 'Tier free disabled' : 'No rollover schedule'
    };
  } catch (err: any) {
    return {
      resetAt: null,
      isPermanent: false,
      reason: err.message || 'Subscription check failed'
    };
  }
}

export class TTSRouter {
  private keyPool: KeyPoolManager;

  constructor(keyPool: KeyPoolManager) {
    this.keyPool = keyPool;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  /**
   * Synthesize a single sentence chunk with automatic key estafet failover.
   * If a key exhausts its quota or gets rate-limited, it is marked resting/exhausted
   * and the chunk is immediately handed off to another idle key.
   */
  private async synthesizeChunkWithFailover(
    chunkText: string,
    targetVoiceId: string,
    modelId: string,
    preferredTier?: string
  ): Promise<Buffer> {
    const attemptedKeys = new Set<string>();
    let lastError: Error | null = null;
    const maxAttempts = 30;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const key = this.keyPool.acquireWorkerKey('elevenlabs', attemptedKeys, preferredTier);
      if (!key) {
        break;
      }
      attemptedKeys.add(key.id);

      const startTime = Date.now();
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': key.secret || key.key_encrypted,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: chunkText,
            model_id: modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        });

        const latency = Date.now() - startTime;

        if (response.status === 403 || response.status === 429) {
          const errorDetail = await safeResponseText(response);
          // Check subscription in background to determine resting duration vs permanent replacement
          const subInfo = await checkElevenLabsSubscription(key.secret || key.key_encrypted);
          this.keyPool.markResting(key.id, subInfo.resetAt, subInfo.reason, subInfo.isPermanent);
          this.keyPool.logUsage(key.id, 'tts_chunk', 0, false, latency, {
            provider: 'elevenlabs',
            model: modelId,
            statusCode: response.status,
            error: errorDetail
          });
          // ESTAFET: immediately loop to acquire next idle worker key
          continue;
        }

        if (response.status === 401) {
          this.keyPool.markError(key.id, 'ElevenLabs authentication failed');
          this.keyPool.releaseWorkerKey(key.id);
          this.keyPool.logUsage(key.id, 'tts_chunk', 0, false, latency, {
            provider: 'elevenlabs',
            model: modelId,
            statusCode: response.status,
            error: await safeResponseText(response)
          });
          // ESTAFET: try next key
          continue;
        }

        if (!response.ok) {
          const detail = await safeResponseText(response);
          this.keyPool.releaseWorkerKey(key.id);
          lastError = new Error(`ElevenLabs TTS chunk failed ${response.status}: ${detail}`);
          continue;
        }

        // Chunk succeeded
        const arrayBuffer = await response.arrayBuffer();
        const audio = Buffer.from(arrayBuffer);
        this.keyPool.releaseWorkerKey(key.id);
        this.keyPool.logUsage(key.id, 'tts_chunk', chunkText.length, true, latency, {
          provider: 'elevenlabs',
          model: modelId,
          statusCode: 200,
          metadata: { voiceId: targetVoiceId, bytes: audio.length }
        });

        return audio;
      } catch (err: any) {
        this.keyPool.releaseWorkerKey(key.id);
        lastError = err;
      }
    }

    throw lastError || new Error('No available ElevenLabs key was able to synthesize the voice chunk.');
  }

  /**
   * Main synthesis entry point.
   * Splits input into sentence chunks and distributes them across idle ElevenLabs keys in parallel,
   * then stitches the resulting MP3 buffers into a single seamless audio file.
   */
  public async speak(text: string, voiceId?: string, tier?: string): Promise<Buffer> {
    const config = getTTSConfig();
    const targetVoiceId = voiceId || config.defaultVoiceId;
    const modelId = config.modelId || 'eleven_multilingual_v2';
    const cachePath = this.cachePath(text, targetVoiceId, modelId);

    if (config.cacheEnabled && fs.existsSync(cachePath)) {
      const cachedAudio = fs.readFileSync(cachePath);
      EventBus.emit('tts:cache-hit', { voiceId: targetVoiceId, bytes: cachedAudio.length });
      return cachedAudio;
    }

    const isDistributed = config.distributedEnabled !== false;
    const minChars = config.minChunkChars || 25;
    const maxConcurrency = Math.max(1, Math.min(12, config.maxConcurrency || 6));

    const sentences = isDistributed ? splitIntoSentences(text, minChars) : [text.trim()];

    // Single chunk or text too short for splitting: synthesize directly
    if (sentences.length <= 1) {
      const audio = await this.synthesizeChunkWithFailover(text, targetVoiceId, modelId, tier);
      if (config.cacheEnabled) {
        fs.writeFileSync(cachePath, audio);
      }
      EventBus.emit('tts:audio-ready', { voiceId: targetVoiceId, bytes: audio.length, keyCount: 1 });
      return audio;
    }

    // Multi-sentence: dispatch across active ElevenLabs keys concurrently
    const results: Buffer[] = new Array(sentences.length);
    let currentIndex = 0;

    const runWorker = async () => {
      while (currentIndex < sentences.length) {
        const idx = currentIndex++;
        const sentenceText = sentences[idx];
        results[idx] = await this.synthesizeChunkWithFailover(sentenceText, targetVoiceId, modelId, tier);
      }
    };

    const workerCount = Math.min(sentences.length, maxConcurrency);
    const workers = Array.from({ length: workerCount }, () => runWorker());
    await Promise.all(workers);

    // Concatenate all sentence audio chunks seamlessly
    const combinedAudio = concatenateMp3Buffers(results);

    if (config.cacheEnabled) {
      fs.writeFileSync(cachePath, combinedAudio);
    }

    EventBus.emit('tts:audio-ready', {
      voiceId: targetVoiceId,
      bytes: combinedAudio.length,
      chunks: sentences.length,
      workerCount
    });

    return combinedAudio;
  }

  private cachePath(text: string, voiceId: string, modelId: string) {
    const hash = crypto.createHash('sha256').update(`${voiceId}:${modelId}:${text}`).digest('hex');
    return path.join(CACHE_DIR, `${hash}.mp3`);
  }
}

async function safeResponseText(response: Response) {
  try {
    return (await response.text()).slice(0, 500) || response.statusText;
  } catch {
    return response.statusText;
  }
}
