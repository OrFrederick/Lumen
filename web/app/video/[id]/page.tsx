import Link from "next/link";
import { notFound } from "next/navigation";
import EntityChip from "@/components/EntityChip";
import StoryCard from "@/components/StoryCard";
import {
  getVideo,
  getVideoEntities,
  getVideoStories,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function fmtTs(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function VideoPage({ params }: PageProps) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) notFound();

  const stories = getVideoStories(id);
  const entities = getVideoEntities(id);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs opacity-60">
          {video.channel ?? "Unknown channel"}
          {video.published_at ? ` · ${video.published_at.slice(0, 10)}` : ""}
          {video.field ? ` · ${video.field}` : ""}
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{video.title ?? id}</h1>
        {video.description ? (
          <p className="text-sm opacity-80 max-w-3xl whitespace-pre-line">
            {video.description}
          </p>
        ) : null}
        {video.url ? (
          <Link
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent underline-offset-2 hover:underline"
          >
            Open on YouTube →
          </Link>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Story-moments</h2>
          {stories.length === 0 ? (
            <p className="text-sm opacity-60">No stories extracted yet.</p>
          ) : (
            <ul className="space-y-3">
              {stories.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <div className="w-14 shrink-0 text-xs opacity-60 font-mono pt-2">
                    {fmtTs(s.ts_start)}
                  </div>
                  <div className="flex-1">
                    <StoryCard story={s} compact />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold opacity-80">Entities</h2>
          {entities.length === 0 ? (
            <p className="text-sm opacity-60">No entities resolved yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {entities.map((e) => (
                <EntityChip key={e.id} entity={e} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
