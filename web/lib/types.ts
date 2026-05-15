// TypeScript types matching the SQL schema in scripts/lib/db.py.
// Keep field names in sync with the Python source-of-truth.

export type StoryKind =
  | "anecdote"
  | "experiment"
  | "fun_fact"
  | "history"
  | "quote"
  | "surprise"
  | "claim";

export type EntityKind =
  | "person"
  | "concept"
  | "work"
  | "event"
  | "paper"
  | "experiment"
  | "place";

export interface Video {
  id: string;
  title: string | null;
  channel: string | null;
  channel_handle: string | null;
  published_at: string | null;
  duration_sec: number | null;
  url: string | null;
  thumbnail_url: string | null;
  description: string | null;
  field: string | null;
}

export interface Story {
  id: number;
  video_id: string;
  ts_start: number | null;
  ts_end: number | null;
  kind: StoryKind | null;
  title: string | null;
  body: string | null;
  significance: string | null;
  historical_year: number | null;
  historical_place: string | null;
  takeaway: string | null;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  name: string;
  slug: string | null;
  description: string | null;
  wikipedia_url: string | null;
  wikidata_qid: string | null;
  birth_year: number | null;
  death_year: number | null;
  era_start: number | null;
  era_end: number | null;
  occupation: string | null;
  image_url: string | null;
  verified: number;
}

export interface EntityMention {
  story_id: number;
  entity_id: number;
  ts: number | null;
  context: string | null;
  role: string | null;
}

export interface Topic {
  id: number;
  name: string;
  slug: string | null;
  field: string | null;
}

export interface StoryWithVideo extends Story {
  video_title: string | null;
  video_published_at: string | null;
}

export interface TimelineData {
  lifespans: Array<Pick<Entity, "id" | "name" | "slug" | "birth_year" | "death_year" | "occupation">>;
  eras: Array<Pick<Entity, "id" | "name" | "slug" | "era_start" | "era_end" | "kind">>;
  pins: Array<{
    id: number;
    title: string | null;
    kind: StoryKind | null;
    historical_year: number;
    video_id: string;
  }>;
  publishDates: Array<{ id: string; title: string | null; year: number }>;
  domain: { min: number; max: number };
}

export interface SearchHit {
  id: number;
  title: string | null;
  snippet: string;
}

export interface SimilarHit {
  id: number;
  title: string | null;
  distance: number;
}
