import Link from "next/link";
import { notFound } from "next/navigation";
import WatchButton from "@/components/WatchButton";
import EntityChip from "@/components/EntityChip";
import { getStoryEntities, getStoryWithVideo } from "@/lib/queries";
import type { Entity, EntityMention } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RelatedHit {
  id: number;
  title: string | null;
  distance: number;
}

async function fetchRelated(id: number, base: string): Promise<RelatedHit[]> {
  try {
    const res = await fetch(`${base}/api/similar?story_id=${id}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: RelatedHit[] };
    return data.results;
  } catch {
    return [];
  }
}

export default async function StoryPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const story = getStoryWithVideo(id);
  if (!story) notFound();

  const entities: Array<Entity & Partial<EntityMention>> = getStoryEntities(id);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs opacity-60 uppercase tracking-wider">
          {story.kind ?? "story"}
          {story.historical_year ? ` · ${story.historical_year}` : ""}
          {story.historical_place ? ` · ${story.historical_place}` : ""}
        </div>
        <h1 className="text-3xl font-semibold leading-tight">
          {story.title ?? "Untitled story"}
        </h1>
        {story.video_title ? (
          <p className="text-sm opacity-70">
            From{" "}
            <Link href={`/video/${story.video_id}`} className="underline-offset-2 hover:underline">
              {story.video_title}
            </Link>
          </p>
        ) : null}
      </header>

      {story.body ? (
        <p className="text-base leading-relaxed max-w-3xl">{story.body}</p>
      ) : null}

      {story.takeaway ? (
        <p className="italic border-l-2 border-current/20 pl-4 max-w-3xl">{story.takeaway}</p>
      ) : null}

      {story.significance ? (
        <section className="max-w-3xl space-y-1">
          <h2 className="text-sm font-semibold opacity-80">Why it matters</h2>
          <p className="text-sm opacity-90">{story.significance}</p>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-3">
        <WatchButton videoId={story.video_id} tsStart={story.ts_start} />
        <Link
          href={`/walk?seed=${story.id}`}
          className="text-sm opacity-80 hover:opacity-100 underline-offset-2 hover:underline"
        >
          Find similar →
        </Link>
      </section>

      {entities.length > 0 ? (
        <section className="space-y-2 max-w-3xl">
          <h2 className="text-sm font-semibold opacity-80">Entities</h2>
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e) => (
              <EntityChip key={e.id} entity={e} role={e.role ?? undefined} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="max-w-3xl space-y-2">
        <h2 className="text-sm font-semibold opacity-80">Transcript snippet</h2>
        <p className="text-sm opacity-60 italic">
          {/* TODO: join transcript segments around ts_start..ts_end once transcript table lands. */}
          Transcript snippets aren't joined yet — coming once `transcript_segments` is wired.
        </p>
      </section>

      <RelatedSection storyId={id} />
    </article>
  );
}

async function RelatedSection({ storyId }: { storyId: number }) {
  // Use absolute URL via NEXT_PUBLIC_SITE_URL if set; default to localhost-safe relative.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const related = await fetchRelated(storyId, base);

  // Even if /api/similar returns nothing (e.g., sqlite-vec not loaded), show graceful state.
  if (related.length === 0) {
    return (
      <section className="max-w-3xl space-y-2">
        <h2 className="text-sm font-semibold opacity-80">Related stories</h2>
        <p className="text-sm opacity-60">
          No related stories yet — embeddings may not be populated.
        </p>
      </section>
    );
  }
  return (
    <section className="max-w-3xl space-y-3">
      <h2 className="text-sm font-semibold opacity-80">Related stories</h2>
      <ul className="space-y-2">
        {related.map((r) => (
          <li key={r.id} className="rounded border border-current/10 p-3 text-sm">
            <Link href={`/story/${r.id}`} className="font-medium hover:underline">
              {r.title ?? "Untitled story"}
            </Link>
            <span className="opacity-60 ml-2 text-xs">distance {r.distance.toFixed(3)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

