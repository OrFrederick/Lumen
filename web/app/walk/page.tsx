import WalkClient, { type WalkStory } from "@/components/WalkClient";
import { getStoryEntities, recentStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ i?: string }>;
}

// Pull a generously large slice; recentStories joins to videos so we get
// video_title for the eyebrow. This is the closest pre-existing query to
// "all stories with video" without touching web/lib.
const WALK_LIMIT = 10_000;

export default async function WalkPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const stories = recentStories(WALK_LIMIT);

  if (stories.length === 0) {
    return (
      <main className="walk-page">
        <div className="shell walk-stage">
          <p style={{ fontStyle: "italic", color: "var(--ink-mute, #8A7E6E)", fontFamily: "var(--serif, ui-serif, Georgia, serif)" }}>
            No stories yet — ingest a few videos and run <code>/process</code>, then come back for a walk.
          </p>
        </div>
      </main>
    );
  }

  const walk: WalkStory[] = stories.map((story) => ({
    story,
    entities: getStoryEntities(story.id),
  }));

  const rawI = sp.i != null ? Number.parseInt(sp.i, 10) : 0;
  const initialIndex =
    Number.isFinite(rawI) && rawI >= 0 && rawI < walk.length ? rawI : 0;

  return <WalkClient stories={walk} initialIndex={initialIndex} />;
}
