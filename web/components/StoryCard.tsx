import Link from "next/link";
import WatchButton from "./WatchButton";
import EntityChip from "./EntityChip";
import type { Entity, EntityMention, Story } from "@/lib/types";

interface Props {
  story: Story;
  entities?: Array<Entity & Partial<EntityMention>>;
  compact?: boolean;
}

const kindStyle: Record<string, string> = {
  anecdote: "border-blue-500/40 bg-blue-500/5",
  experiment: "border-emerald-500/40 bg-emerald-500/5",
  fun_fact: "border-purple-500/40 bg-purple-500/5",
  history: "border-amber-500/40 bg-amber-500/5",
  quote: "border-gray-500/40 bg-gray-500/5",
  surprise: "border-pink-500/40 bg-pink-500/5",
  claim: "border-red-500/40 bg-red-500/5",
};

export default function StoryCard({ story, entities = [], compact = false }: Props) {
  const cls = (story.kind && kindStyle[story.kind]) || "border-current/15";
  return (
    <article className={`rounded-lg border ${cls} p-4 space-y-3`}>
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">
            <Link href={`/story/${story.id}`} className="hover:underline">
              {story.title ?? "Untitled story"}
            </Link>
          </h3>
          {story.kind ? (
            <span className="text-xs uppercase tracking-wider opacity-60">{story.kind}</span>
          ) : null}
        </div>
        {story.historical_year != null ? (
          <div className="text-xs opacity-60">
            {story.historical_year}
            {story.historical_place ? ` · ${story.historical_place}` : ""}
          </div>
        ) : null}
      </header>

      {!compact && story.body ? <p className="text-sm leading-relaxed">{story.body}</p> : null}

      {story.takeaway ? (
        <p className="text-sm italic opacity-80 border-l-2 border-current/20 pl-3">
          {story.takeaway}
        </p>
      ) : null}

      {entities.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entities.map((e) => (
            <EntityChip key={e.id} entity={e} role={e.role ?? undefined} />
          ))}
        </div>
      ) : null}

      <footer className="flex items-center gap-3 pt-1">
        <WatchButton videoId={story.video_id} tsStart={story.ts_start} />
        <Link
          href={`/walk?seed=${story.id}`}
          className="text-xs opacity-70 hover:opacity-100 underline-offset-2 hover:underline"
        >
          Find similar →
        </Link>
      </footer>
    </article>
  );
}
