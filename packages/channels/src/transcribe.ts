import OpenAI from 'openai';
import { createLogger } from '@nexuszero/shared';

const logger = createLogger('channels:transcribe');

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB (Whisper limit is 25 MB)

/**
 * Download audio from a URL and transcribe it via OpenAI Whisper.
 * Returns null when:
 * - OPENAI_API_KEY is not set
 * - Audio exceeds MAX_AUDIO_BYTES
 * - Download or transcription fails
 */
export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — Whisper transcription unavailable');
    return null;
  }

  try {
    // Download audio with size check
    const res = await fetch(audioUrl);
    if (!res.ok) {
      logger.warn(`Failed to download audio: HTTP ${res.status}`, { audioUrl });
      return null;
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_BYTES) {
      logger.warn(`Audio too large: ${contentLength} bytes (max ${MAX_AUDIO_BYTES})`, { audioUrl });
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      logger.warn(`Audio too large after download: ${buffer.byteLength} bytes`, { audioUrl });
      return null;
    }

    // Extract filename from URL for Whisper
    const urlPath = new URL(audioUrl).pathname;
    const filename = urlPath.split('/').pop() || 'audio.mp3';

    const openai = new OpenAI({ apiKey });
    const file = new File([buffer], filename, { type: 'audio/mpeg' });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'text',
    });

    const text = typeof transcription === 'string' ? transcription : (transcription as any).text ?? '';

    if (!text || text.length < 50) {
      logger.warn('Whisper returned empty or very short transcript', { audioUrl, length: text.length });
      return null;
    }

    logger.info('Transcription complete', { audioUrl, length: text.length });
    return text;
  } catch (err) {
    logger.warn('Transcription failed', { audioUrl, error: (err as Error).message });
    return null;
  }
}
