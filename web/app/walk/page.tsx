import Link from "next/link";
import StoryCard from "@/components/StoryCard";
import { getStoryEntities, getStoryWithVideo, randomStory, similarStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ seed?: string }>;
}

export default async function WalkPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const seedNum = sp.seed != null ? Number(sp.seed) : null;
  const seedId = seedNum != null && Number.isFinite(seedNum) ? seedNum : null;

  let story = seedId != null ? getStoryWithVideo(seedId) : null;
  if (!story) story = randomStory();

  if (!story) {
    return (
      <div className="rounded border border-dashed border-current/20 p-10 text-center opacity-70">
        No stories yet — ingest some videos and run <code>/process</code>.
      </div>
    );
  }

  const entities = getStoryEntities(story.id);
  const similar = similarStories(story.id, 8);
  const next = similar.length > 0 ? similar[0]! : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-xs opacity-60">walk · serendipity feed</div>
      <StoryCard story={story} entities={entities} />
      <div className="flex items-center justify-between">
        <Link
          href={next ? `/walk?seed=${next.id}` : "/walk"}
          className="rounded-md border border-current/15 bg-accent text-white px-4 py-2 text-sm hover:opacity-90"
        >
          Next →
        </Link>
        <Link href="/" className="text-sm opacity-70 hover:opacity-100 underline-offset-2 hover:underline">
          Back to timeline
        </Link>
      </div>
      {similar.length > 1 ? (
        <section className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold opacity-80">Nearby stories</h2>
          <ul className="space-y-1 text-sm">
            {similar.slice(1).map((s) => (
              <li key={s.id}>
                <Link href={`/walk?seed=${s.id}`} className="hover:underline">
                  {s.title ?? "Untitled"} <span className="opacity-50 text-xs">{s.distance.toFixed(3)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
