import Timeline from "@/components/Timeline";
import StoryCard from "@/components/StoryCard";
import SearchBar from "@/components/SearchBar";
import { recentStories, storyCount, timelineData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const data = timelineData();
  const feed = recentStories(12);
  const total = storyCount();

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">A timeline of science stories</h1>
        <p className="text-sm opacity-70 max-w-2xl">
          Lifespans, eras, and story-pins drawn from {total.toLocaleString()} stories. Drag to
          pan, scroll to zoom. Click a pin for the story; click a person chip for everything
          they appear in.
        </p>
      </section>

      <section className="rounded-lg border border-current/10 p-3">
        <Timeline data={data} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent stories</h2>
          {feed.length === 0 ? (
            <div className="rounded border border-dashed border-current/20 p-6 text-sm opacity-70">
              No stories yet — ingest some videos and run <code>/process</code> to extract.
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {feed.map((s) => (
                <li key={s.id}>
                  <StoryCard story={s} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <h2 className="text-lg font-semibold">Search</h2>
          <SearchBar />
        </aside>
      </div>
    </div>
  );
}
