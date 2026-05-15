import Link from "next/link";
import { notFound } from "next/navigation";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import {
  getVideo,
  getVideoStories,
} from "@/lib/queries";
import {
  KIND_LABELS,
  formatDuration,
  toStoryView,
  toVideoView,
} from "@/lib/view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

function formatPublished(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function VideoPage({ params }: PageProps) {
  const { id } = await params;
  const raw = getVideo(id);
  if (!raw) notFound();

  const video = toVideoView(raw);
  const stories = getVideoStories(id)
    .slice()
    .sort((a, b) => {
      const ax = a.ts_start ?? Number.POSITIVE_INFINITY;
      const bx = b.ts_start ?? Number.POSITIVE_INFINITY;
      return ax - bx;
    })
    .map((s) => toStoryView(s));

  const years = stories
    .map((s) => s.year)
    .filter((y): y is number => y != null);
  const span =
    years.length > 0
      ? `${Math.min(...years)} – ${Math.max(...years)}`
      : "—";

  const description = video.description
    ? truncate(video.description, 280)
    : "";

  return (
    <main className="shell video-page">
      <div className="sp-eyebrow" style={{ marginBottom: 22 }}>
        <Link
          href="/"
          style={{ color: "var(--ink-mute)", fontSize: 13 }}
        >
          ← Library
        </Link>
      </div>

      <div className="vp-hero">
        <YouTubeEmbed videoId={video.id} title={video.title} />
        <div className="vp-meta">
          {video.channel ? (
            <span className="smallcaps">{video.channel}</span>
          ) : null}
          <h1>{video.title}</h1>
          {description ? <p className="vp-desc">{description}</p> : null}
          <div className="vp-meta-grid">
            <div>
              <div className="label">Published</div>
              <div className="value">{formatPublished(video.published_at)}</div>
            </div>
            <div>
              <div className="label">Duration</div>
              <div className="value">
                {formatDuration(video.duration_sec) || "—"}
              </div>
            </div>
            <div>
              <div className="label">Story-moments</div>
              <div className="value">{stories.length}</div>
            </div>
            <div>
              <div className="label">Span</div>
              <div className="value">{span}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="vp-stories">
        <h2>Moments in this video</h2>
        <div className="vp-stories-list">
          {stories.map((s) => (
            <Link
              key={s.id}
              href={`/story/${s.id}`}
              className="vp-story-row"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <div className="vp-story-num" />
              <div>
                <div className="vp-story-title">{s.title}</div>
                {s.takeaway ? (
                  <div className="vp-story-take">{s.takeaway}</div>
                ) : null}
              </div>
              <div className="vp-story-tag">
                {s.kind ? KIND_LABELS[s.kind] : ""}
                {s.year != null ? (
                  <>
                    <br />
                    {s.year}
                  </>
                ) : null}
              </div>
            </Link>
          ))}
          {stories.length === 0 ? (
            <div
              style={{
                padding: "32px 0",
                color: "var(--ink-mute)",
                fontStyle: "italic",
                fontFamily: "var(--serif)",
              }}
            >
              No story-moments extracted yet.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
