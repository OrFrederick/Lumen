// View-layer types used by the redesign components.
// Maps raw DB rows to a shape that matches the design prototype.

import type { Entity, Story, StoryKind, Video } from "./types";

export type Field = "physics" | "engineering" | "biology" | "mathematics" | "chemistry" | "other";

export const FIELD_LABELS: Record<Field, string> = {
  physics: "Physics",
  engineering: "Engineering",
  biology: "Biology",
  mathematics: "Mathematics",
  chemistry: "Chemistry",
  other: "Other",
};

export const FIELDS: Field[] = ["physics", "engineering", "biology", "mathematics", "chemistry"];

export const KIND_LABELS: Record<StoryKind, string> = {
  anecdote: "Anecdote",
  experiment: "Experiment",
  fun_fact: "Fun fact",
  history: "History",
  quote: "Quote",
  surprise: "Surprise",
  claim: "Claim",
};

export const KIND_COLORS: Record<StoryKind, string> = {
  anecdote: "#7A5A2E",
  experiment: "#3D6B5C",
  fun_fact: "#9C6B3F",
  quote: "#6B5A8A",
  surprise: "#A8504E",
  claim: "#4A6B8A",
  history: "#5A5A50",
};

/** Infer a field from a person's occupation string (best-effort). */
export function inferField(occupation: string | null | undefined): Field {
  if (!occupation) return "other";
  const o = occupation.toLowerCase();
  if (/(physic|astronom|cosmolog|relativ)/.test(o)) return "physics";
  if (/(engineer|inventor|technolog)/.test(o)) return "engineering";
  if (/(biolog|medic|physician|surgeon|virolog|geneticist|zoolog|botan)/.test(o)) return "biology";
  if (/(mathemat|statistic|logician)/.test(o)) return "mathematics";
  if (/(chemist|chemistry)/.test(o)) return "chemistry";
  return "other";
}

/** Build a slug for an entity that lacks one. */
export function entitySlug(e: Pick<Entity, "id" | "name" | "slug">): string {
  if (e.slug && e.slug.length > 0) return e.slug;
  return e.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `e${e.id}`;
}

/** Short label for use in compact chips (first + last word for people). */
export function shortName(e: Pick<Entity, "name" | "kind">): string {
  if (e.kind !== "person") return e.name;
  const parts = e.name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return e.name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Story plus the video meta we typically render alongside it. */
export interface StoryView {
  id: number;
  kind: StoryKind | null;
  title: string;
  body: string;
  takeaway: string;
  year: number | null;
  video_id: string;
  video_title: string | null;
  video_channel: string | null;
  ts_start: number | null;
}

export function toStoryView(s: Story & { video_title?: string | null; video_channel?: string | null }): StoryView {
  return {
    id: s.id,
    kind: s.kind,
    title: s.title ?? "Untitled",
    body: s.body ?? "",
    takeaway: s.takeaway ?? "",
    year: s.historical_year,
    video_id: s.video_id,
    video_title: s.video_title ?? null,
    video_channel: s.video_channel ?? null,
    ts_start: s.ts_start,
  };
}

/** Entity, normalized for view (always has slug, derived field). */
export interface EntityView {
  id: number;
  kind: Entity["kind"];
  name: string;
  slug: string;
  short: string;
  description: string | null;
  wikipedia_url: string | null;
  birth_year: number | null;
  death_year: number | null;
  occupation: string | null;
  image_url: string | null;
  field: Field;
}

export function toEntityView(e: Entity): EntityView {
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    slug: entitySlug(e),
    short: shortName(e),
    description: e.description,
    wikipedia_url: e.wikipedia_url,
    birth_year: e.birth_year,
    death_year: e.death_year,
    occupation: e.occupation,
    image_url: e.image_url,
    field: inferField(e.occupation),
  };
}

export interface VideoView {
  id: string;
  title: string;
  channel: string | null;
  channel_handle: string | null;
  published_at: string | null;
  duration_sec: number | null;
  url: string | null;
  thumbnail_url: string | null;
  description: string | null;
}

export function toVideoView(v: Video): VideoView {
  return {
    id: v.id,
    title: v.title ?? "Untitled video",
    channel: v.channel,
    channel_handle: v.channel_handle,
    published_at: v.published_at,
    duration_sec: v.duration_sec,
    url: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail_url: v.thumbnail_url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    description: v.description,
  };
}

export function formatDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function youtubeMomentUrl(videoId: string, tsStart: number | null): string {
  return `https://www.youtube.com/watch?v=${videoId}${tsStart ? `&t=${tsStart}s` : ""}`;
}
