import Link from "next/link";
import { notFound } from "next/navigation";
import { Body } from "@/components/Body";
import { KindBadge } from "@/components/KindBadge";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import {
  getRelatedStoriesByEntity,
  getStoryEntities,
  getStoryWithVideoMeta,
  getVideo,
} from "@/lib/queries";
import {
  formatDuration,
  toEntityView,
  youtubeMomentUrl,
  type EntityView,
} from "@/lib/view";
import type { EntityKind } from "@/lib/types";

export const dynamic = "force-dynamic";

// Display labels for entity kinds (the story-level KIND_LABELS is for StoryKind).
const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  person: "Person",
  concept: "Concept",
  work: "Work",
  event: "Event",
  paper: "Paper",
  experiment: "Experiment",
  place: "Place",
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const story = getStoryWithVideoMeta(id);
  if (!story) notFound();

  const rawEntities = getStoryEntities(id);
  const entityViews: EntityView[] = rawEntities.map(toEntityView);
  const video = getVideo(story.video_id);
  const related = getRelatedStoriesByEntity(id, 3);

  const watchUrl = youtubeMomentUrl(story.video_id, story.ts_start);

  return (
    <main className="shell story-page">
      <div className="sp-eyebrow">
        <Link href="/">← Library</Link>
        <KindBadge kind={story.kind} />
        {story.historical_year != null && (
          <span style={{ fontSize: 13, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>
            {story.historical_year}
          </span>
        )}
      </div>

      <h1>{story.title ?? "Untitled"}</h1>

      {story.takeaway && story.takeaway.length > 0 && (
        <p className="sp-takeaway">{story.takeaway}</p>
      )}

      {story.body && story.body.length > 0 && (
        <div className="sp-body">
          <p>
            <Body text={story.body} entities={entityViews} />
          </p>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "36px 0" }}>
        <YouTubeEmbed
          videoId={story.video_id}
          startSec={story.ts_start}
          title={story.title}
        />
      </div>

      <div className="sp-meta">
        <a className="sp-watch" href={watchUrl} target="_blank" rel="noopener noreferrer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
          Watch this moment
        </a>
        {video && (
          <>
            <span>
              From{" "}
              <Link href={`/video/${video.id}`} style={{ color: "var(--ink)" }}>
                <em>{video.title ?? "Untitled video"}</em>
              </Link>
            </span>
            {video.channel && (
              <>
                <span>·</span>
                <span>
                  {video.channel}
                  {video.duration_sec ? ` · ${formatDuration(video.duration_sec)}` : ""}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {entityViews.length > 0 && (
        <div className="sp-entities-block">
          <h4>In this moment</h4>
          <div className="sp-entities-list">
            {entityViews.map((e) => {
              const initials = monogram(e.name);
              const tag =
                e.kind === "person"
                  ? `${e.birth_year ?? "?"}–${e.death_year ?? "?"}${e.occupation ? ` · ${e.occupation}` : ""}`
                  : `${ENTITY_KIND_LABELS[e.kind] ?? e.kind}${e.description ? ` · ${truncate(e.description, 60)}` : ""}`;

              const row = (
                <div className="sp-entity-row">
                  <div className="spe-icon">{initials}</div>
                  <div className="spe-main">
                    <div className="spe-name">{e.name}</div>
                    <div className="spe-tag">{tag}</div>
                  </div>
                </div>
              );

              if (e.kind === "person") {
                return (
                  <Link
                    key={e.id}
                    href={`/person/${e.slug}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {row}
                  </Link>
                );
              }
              return <div key={e.id}>{row}</div>;
            })}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <h4
            style={{
              fontFamily: "var(--sans)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--ink-mute)",
              marginBottom: 18,
            }}
          >
            Adjacent moments
          </h4>
          {related.map((s) => (
            <Link
              key={s.id}
              href={`/story/${s.id}`}
              style={{
                display: "block",
                padding: "16px 0",
                borderBottom: "1px solid var(--rule-soft)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 4 }}>
                <KindBadge kind={s.kind} />
                {s.historical_year != null && (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      color: "var(--ink-mute)",
                    }}
                  >
                    {s.historical_year}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>
                {s.title ?? "Untitled"}
              </div>
              {s.takeaway && (
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    marginTop: 6,
                  }}
                >
                  {s.takeaway}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
