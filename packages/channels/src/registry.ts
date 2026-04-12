import type { Channel, ChannelHealth, ChannelId } from './types.js';
import { RedditChannel } from './channels/reddit.js';
import { YouTubeChannel } from './channels/youtube.js';
import { RssChannel } from './channels/rss.js';
import { JinaChannel } from './channels/jina.js';
import { ExaChannel } from './channels/exa.js';
import { PodcastChannel } from './channels/podcast.js';

const registry = new Map<ChannelId, Channel>();

function ensureRegistered(): void {
  if (registry.size > 0) return;
  const channels: Channel[] = [
    new RedditChannel(),
    new YouTubeChannel(),
    new RssChannel(),
    new JinaChannel(),
    new ExaChannel(),
    new PodcastChannel(),
  ];
  for (const ch of channels) {
    registry.set(ch.id, ch);
  }
}

export function getChannel(id: ChannelId): Channel {
  ensureRegistered();
  const ch = registry.get(id);
  if (!ch) throw new Error(`Unknown channel: ${id}`);
  return ch;
}

export function getAllChannels(): Channel[] {
  ensureRegistered();
  return Array.from(registry.values());
}

export async function checkAllChannels(): Promise<Record<string, ChannelHealth>> {
  ensureRegistered();
  const results: Record<string, ChannelHealth> = {};
  const entries = Array.from(registry.entries());
  const checks = await Promise.allSettled(entries.map(([, ch]) => ch.healthCheck()));
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i]![0];
    const check = checks[i]!;
    results[id] = check.status === 'fulfilled'
      ? check.value
      : { ok: false, message: (check.reason as Error).message, checkedAt: new Date().toISOString() };
  }
  return results;
}
