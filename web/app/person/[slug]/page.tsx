import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryCard } from "@/components/StoryCard";
import {
  getPersonBySlug,
  getStoriesForPerson,
  getStoryEntities,
} from "@/lib/queries";
import {
  FIELD_LABELS,
  inferField,
  shortName,
  toEntityView,
  toStoryView,
  type StoryView,
} from "@/lib/view";

export const dynamic = "force-dynamic";

function computeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);
  if (!person) notFound();

  const rawStories = getStoriesForPerson(slug);
  const stories: StoryView[] = rawStories.map((s) => toStoryView(s));

  // Group stories by video, preserving insertion order.
  const grouped = new Map<string, { title: string; items: StoryView[] }>();
  for (const s of stories) {
    const key = s.video_id;
    const entry = grouped.get(key);
    if (entry) {
      entry.items.push(s);
    } else {
      grouped.set(key, { title: s.video_title ?? key, items: [s] });
    }
  }

  // Fetch and convert entities per story for the StoryCard chips.
  const entitiesByStory = new Map<number, ReturnType<typeof toEntityView>[]>();
  for (const s of stories) {
    const rows = getStoryEntities(s.id);
    entitiesByStory.set(
      s.id,
      rows.map((r) => toEntityView(r)),
    );
  }

  const field = inferField(person.occupation);
  const fieldLabel = FIELD_LABELS[field];
  const short = shortName(person);
  const initials = computeInitials(person.name);
  const lived =
    person.birth_year != null && person.death_year != null
      ? person.death_year - person.birth_year
      : null;
  const hasDates = person.birth_year != null || person.death_year != null;
  const hasDatesOrOccupation = hasDates || !!person.occupation;

  return (
    <main className="shell person-page">
      <div className="sp-eyebrow" style={{ marginBottom: 22 }}>
        <Link href="/" style={{ color: "var(--ink-mute)", fontSize: 13 }}>
          ← Library
        </Link>
      </div>

      <header className="pp-header">
        <div className="pp-portrait">
          {person.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.image_url} alt={person.name} />
          ) : (
            initials
          )}
        </div>
        <div className="pp-info">
          <div className="pp-eyebrow">
            <span className="smallcaps">Person · {fieldLabel}</span>
          </div>
          <h1>{person.name}</h1>
          {hasDatesOrOccupation && (
            <div className="pp-dates">
              {person.birth_year != null ? (
                <strong>{person.birth_year}</strong>
              ) : null}
              {person.birth_year != null && person.death_year != null
                ? " – "
                : null}
              {person.death_year != null ? (
                <strong>{person.death_year}</strong>
              ) : null}
              {hasDates && person.occupation ? " · " : null}
              {person.occupation ?? ""}
            </div>
          )}
          {person.description ? (
            <p className="pp-desc">{person.description}</p>
          ) : null}
          <div className="pp-stat-row">
            <div className="pp-stat">
              <div className="lbl">Stories</div>
              <div className="val">{stories.length}</div>
            </div>
            <div className="pp-stat">
              <div className="lbl">Videos</div>
              <div className="val">{grouped.size}</div>
            </div>
            {lived != null ? (
              <div className="pp-stat">
                <div className="lbl">Lived</div>
                <div className="val">{lived} yrs</div>
              </div>
            ) : null}
            <div className="pp-stat">
              <div className="lbl">Field</div>
              <div className="val" style={{ textTransform: "capitalize" }}>
                {field}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="pp-stories">
        <h2>Where {short} appears</h2>
        {grouped.size === 0 ? (
          <div
            style={{
              padding: "32px 0",
              color: "var(--ink-mute)",
              fontStyle: "italic",
              fontFamily: "var(--serif)",
            }}
          >
            No story-moments yet — but {short} is referenced elsewhere in the
            library.
          </div>
        ) : (
          [...grouped.entries()].map(([vid, { title, items }]) => (
            <div key={vid} className="pp-video-group">
              <h3>
                <span>In:</span>{" "}
                <Link href={`/video/${vid}`} className="vg-title">
                  {title}
                </Link>
              </h3>
              {items.map((s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  entities={entitiesByStory.get(s.id) ?? []}
                  variant="list"
                />
              ))}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
