import { safeAll, safeGet } from "./db";
import type {
  Entity,
  EntityMention,
  SearchHit,
  SimilarHit,
  Story,
  StoryWithVideo,
  TimelineData,
  Topic,
  Video,
} from "./types";

// Read-only helpers. All gracefully degrade to empty results when the
// database is missing or a virtual table is unavailable.

export function getStory(id: number): Story | null {
  return safeGet<Story>(
    `SELECT id, video_id, ts_start, ts_end, kind, title, body, significance,
            historical_year, historical_place, takeaway
       FROM stories WHERE id = ?`,
    [id],
  );
}

export function getStoryWithVideo(id: number): StoryWithVideo | null {
  return safeGet<StoryWithVideo>(
    `SELECT s.id, s.video_id, s.ts_start, s.ts_end, s.kind, s.title, s.body,
            s.significance, s.historical_year, s.historical_place, s.takeaway,
            v.title AS video_title, v.published_at AS video_published_at
       FROM stories s LEFT JOIN videos v ON v.id = s.video_id
       WHERE s.id = ?`,
    [id],
  );
}

export function getVideo(id: string): Video | null {
  return safeGet<Video>(
    `SELECT id, title, channel, channel_handle, published_at, duration_sec,
            url, thumbnail_url, description, field
       FROM videos WHERE id = ?`,
    [id],
  );
}

export function getVideoStories(videoId: string): Story[] {
  return safeAll<Story>(
    `SELECT id, video_id, ts_start, ts_end, kind, title, body, significance,
            historical_year, historical_place, takeaway
       FROM stories WHERE video_id = ?
       ORDER BY ts_start ASC NULLS LAST`,
    [videoId],
  );
}

export function getVideoEntities(videoId: string): Entity[] {
  return safeAll<Entity>(
    `SELECT DISTINCT e.*
       FROM entities e
       JOIN entity_mentions m ON m.entity_id = e.id
       JOIN stories s ON s.id = m.story_id
       WHERE s.video_id = ?
       ORDER BY e.name`,
    [videoId],
  );
}

export function getPersonBySlug(slug: string): Entity | null {
  return safeGet<Entity>(
    `SELECT * FROM entities WHERE slug = ? LIMIT 1`,
    [slug],
  );
}

export function getTopicBySlug(slug: string): Topic | null {
  return safeGet<Topic>(`SELECT * FROM topics WHERE slug = ? LIMIT 1`, [slug]);
}

export function getEntityStories(entityId: number): StoryWithVideo[] {
  return safeAll<StoryWithVideo>(
    `SELECT s.id, s.video_id, s.ts_start, s.ts_end, s.kind, s.title, s.body,
            s.significance, s.historical_year, s.historical_place, s.takeaway,
            v.title AS video_title, v.published_at AS video_published_at
       FROM stories s
       JOIN entity_mentions m ON m.story_id = s.id
       LEFT JOIN videos v ON v.id = s.video_id
       WHERE m.entity_id = ?
       ORDER BY v.published_at DESC NULLS LAST, s.ts_start ASC`,
    [entityId],
  );
}

export function getStoryEntities(storyId: number): Array<Entity & EntityMention> {
  return safeAll<Entity & EntityMention>(
    `SELECT e.id, e.kind, e.name, e.slug, e.description, e.wikipedia_url,
            e.wikidata_qid, e.birth_year, e.death_year, e.era_start, e.era_end,
            e.occupation, e.image_url, e.verified,
            m.story_id, m.entity_id, m.ts, m.context, m.role
       FROM entity_mentions m
       JOIN entities e ON e.id = m.entity_id
      WHERE m.story_id = ?
      ORDER BY CASE m.role WHEN 'central' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END,
               e.name`,
    [storyId],
  );
}

export function getTopicStories(topicId: number): StoryWithVideo[] {
  return safeAll<StoryWithVideo>(
    `SELECT s.id, s.video_id, s.ts_start, s.ts_end, s.kind, s.title, s.body,
            s.significance, s.historical_year, s.historical_place, s.takeaway,
            v.title AS video_title, v.published_at AS video_published_at
       FROM stories s
       JOIN story_topics st ON st.story_id = s.id
       LEFT JOIN videos v ON v.id = s.video_id
       WHERE st.topic_id = ?
       ORDER BY st.weight DESC NULLS LAST, v.published_at DESC NULLS LAST`,
    [topicId],
  );
}

export function searchStories(q: string, limit = 20): SearchHit[] {
  // FTS5 MATCH; sanitize quoting minimally — let FTS handle operators.
  if (!q.trim()) return [];
  return safeAll<SearchHit>(
    `SELECT s.id AS id, s.title AS title,
            snippet(stories_fts, 1, '<mark>', '</mark>', '…', 32) AS snippet
       FROM stories_fts
       JOIN stories s ON s.id = stories_fts.rowid
      WHERE stories_fts MATCH ?
      LIMIT ?`,
    [q, limit],
  );
}

export function similarStories(storyId: number, k = 8): SimilarHit[] {
  // Requires sqlite-vec extension; if it's not loaded, fall back to []
  // by way of safeAll's error handler.
  return safeAll<SimilarHit>(
    `WITH seed AS (
       SELECT embedding FROM story_vecs WHERE rowid = ?
     )
     SELECT s.id AS id, s.title AS title, v.distance AS distance
       FROM story_vecs v
       JOIN stories s ON s.id = v.rowid
      WHERE v.embedding MATCH (SELECT embedding FROM seed)
        AND v.rowid != ?
      ORDER BY v.distance ASC
      LIMIT ?`,
    [storyId, storyId, k],
  );
}

export function recentStories(limit = 12): StoryWithVideo[] {
  return safeAll<StoryWithVideo>(
    `SELECT s.id, s.video_id, s.ts_start, s.ts_end, s.kind, s.title, s.body,
            s.significance, s.historical_year, s.historical_place, s.takeaway,
            v.title AS video_title, v.published_at AS video_published_at
       FROM stories s
       LEFT JOIN videos v ON v.id = s.video_id
       ORDER BY v.published_at DESC NULLS LAST, s.id DESC
       LIMIT ?`,
    [limit],
  );
}

export function randomStory(): StoryWithVideo | null {
  return safeGet<StoryWithVideo>(
    `SELECT s.id, s.video_id, s.ts_start, s.ts_end, s.kind, s.title, s.body,
            s.significance, s.historical_year, s.historical_place, s.takeaway,
            v.title AS video_title, v.published_at AS video_published_at
       FROM stories s LEFT JOIN videos v ON v.id = s.video_id
       ORDER BY RANDOM() LIMIT 1`,
  );
}

export function timelineData(): TimelineData {
  const lifespans = safeAll<TimelineData["lifespans"][number]>(
    `SELECT id, name, slug, birth_year, death_year, occupation
       FROM entities
      WHERE kind = 'person' AND birth_year IS NOT NULL
      ORDER BY birth_year ASC`,
  );
  const eras = safeAll<TimelineData["eras"][number]>(
    `SELECT id, name, slug, era_start, era_end, kind
       FROM entities
      WHERE era_start IS NOT NULL AND era_end IS NOT NULL
      ORDER BY era_start ASC`,
  );
  const pins = safeAll<TimelineData["pins"][number]>(
    `SELECT id, title, kind, historical_year, video_id
       FROM stories
      WHERE historical_year IS NOT NULL
      ORDER BY historical_year ASC`,
  );
  const publishDates = safeAll<TimelineData["publishDates"][number]>(
    `SELECT id, title,
            CAST(strftime('%Y', published_at) AS INTEGER) AS year
       FROM videos
      WHERE published_at IS NOT NULL`,
  );

  // Compute domain. If everything is empty, default to a sane modern range.
  const nowYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (const l of lifespans) {
    if (l.birth_year != null) years.push(l.birth_year);
    if (l.death_year != null) years.push(l.death_year);
  }
  for (const e of eras) {
    if (e.era_start != null) years.push(e.era_start);
    if (e.era_end != null) years.push(e.era_end);
  }
  for (const p of pins) years.push(p.historical_year);
  for (const v of publishDates) years.push(v.year);

  const min = years.length ? Math.min(...years) : nowYear - 200;
  const max = years.length ? Math.max(...years, nowYear) : nowYear;

  return { lifespans, eras, pins, publishDates, domain: { min, max } };
}

export function storyCount(): number {
  const row = safeGet<{ n: number }>(`SELECT COUNT(*) AS n FROM stories`);
  return row?.n ?? 0;
}
