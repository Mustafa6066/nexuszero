/**
 * YouTube Data API v3 Connector — channel and video analytics.
 * Used by Social Agent (yt-competitive) for competitive video intelligence.
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class YouTubeDataConnector extends BaseConnector {
  constructor() {
    super('youtube_data');
  }

  getBaseUrl(): string {
    return 'https://www.googleapis.com/youtube/v3';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/channels?part=id&mine=true', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v3',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v3',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get channel details by ID */
  async getChannel(accessToken: string, channelId: string) {
    return this.request(
      `/channels?part=snippet,statistics,contentDetails&id=${channelId}`,
      accessToken,
    );
  }

  /** Search videos by keyword or channel */
  async searchVideos(accessToken: string, params: {
    query?: string;
    channelId?: string;
    maxResults?: number;
    order?: 'date' | 'viewCount' | 'relevance' | 'rating';
    publishedAfter?: string;
  }) {
    const query = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(params.maxResults ?? 25),
      order: params.order ?? 'date',
    });
    if (params.query) query.set('q', params.query);
    if (params.channelId) query.set('channelId', params.channelId);
    if (params.publishedAfter) query.set('publishedAfter', params.publishedAfter);
    return this.request(`/search?${query}`, accessToken);
  }

  /** Get video statistics (views, likes, comments) */
  async getVideoStats(accessToken: string, videoIds: string[]) {
    return this.request(
      `/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}`,
      accessToken,
    );
  }

  /** List playlist items (e.g., uploads playlist) */
  async getPlaylistItems(accessToken: string, playlistId: string, maxResults = 50) {
    return this.request(
      `/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}`,
      accessToken,
    );
  }

  /** Get video categories */
  async getVideoCategories(accessToken: string, regionCode = 'US') {
    return this.request(
      `/videoCategories?part=snippet&regionCode=${regionCode}`,
      accessToken,
    );
  }
}
