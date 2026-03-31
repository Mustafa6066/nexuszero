import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, socialMentions, socialListeningConfig } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentSignal } from '@nexuszero/queue';
import { searchYouTube, getVideoComments } from '@nexuszero/prober';
import { llmScoreSocialMention } from '../llm.js';

export class YouTubeScanHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    const configs = await withTenantDb(tenantId, async (db) =>
      db.select().from(socialListeningConfig)
        .where(and(
          eq(socialListeningConfig.tenantId, tenantId),
          eq(socialListeningConfig.platform, 'youtube'),
          eq(socialListeningConfig.isActive, true),
        )),
    );

    if (configs.length === 0) return { scanned: 0, message: 'No YouTube listening config' };

    let totalFound = 0;

    for (const config of configs) {
      const keywords = (config.keywords as string[]) ?? [];

      for (const keyword of keywords) {
        // Search for videos mentioning the keyword
        const videos = await searchYouTube(keyword, 10);

        for (const video of videos) {
          // Check video itself
          const videoContent = `${video.title} ${video.description}`.slice(0, 1000);
          const videoId = `yt_video_${video.videoId}`;

          const existingVideo = await withTenantDb(tenantId, async (db) =>
            db.select({ id: socialMentions.id }).from(socialMentions)
              .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.externalId, videoId)))
              .limit(1),
          );

          if (existingVideo.length === 0) {
            const score = await llmScoreSocialMention(videoContent, 'youtube', keywords);
            await withTenantDb(tenantId, async (db) =>
              db.insert(socialMentions).values({
                tenantId,
                platform: 'youtube',
                externalId: videoId,
                authorHandle: video.channelTitle,
                content: videoContent,
                url: video.url,
                videoId: video.videoId,
                sentiment: score.sentiment,
                intent: score.intent,
                engagementScore: score.engagementScore,
                replyStatus: 'monitor',
              }),
            );
            totalFound++;
          }

          // Also scan top comments for brand mentions
          const comments = await getVideoComments(video.videoId, keyword);
          for (const comment of comments.slice(0, 5)) {
            const commentId = `yt_comment_${comment.commentId}`;
            const existingComment = await withTenantDb(tenantId, async (db) =>
              db.select({ id: socialMentions.id }).from(socialMentions)
                .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.externalId, commentId)))
                .limit(1),
            );
            if (existingComment.length > 0) continue;

            const score = await llmScoreSocialMention(comment.text, 'youtube', keywords);
            await withTenantDb(tenantId, async (db) =>
              db.insert(socialMentions).values({
                tenantId,
                platform: 'youtube',
                externalId: commentId,
                authorHandle: comment.author,
                content: comment.text.slice(0, 2000),
                url: video.url,
                videoId: video.videoId,
                sentiment: score.sentiment,
                intent: score.intent,
                engagementScore: score.engagementScore,
                replyStatus: 'monitor',
              }),
            );
            totalFound++;
          }
        }
      }

      await withTenantDb(tenantId, async (db) =>
        db.update(socialListeningConfig)
          .set({ lastScannedAt: new Date() })
          .where(eq(socialListeningConfig.id, config.id)),
      );
    }

    if (totalFound > 0) {
      await publishAgentSignal({
        tenantId, type: 'social.youtube_mention_detected', agentId: 'social',
        data: { platform: 'youtube', totalFound }, priority: 'low', confidence: 0.8,
      });
    }

    return { platform: 'youtube', totalFound };
  }
}
