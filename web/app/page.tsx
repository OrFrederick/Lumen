import { HomeBody } from "@/components/HomeBody";
import { StoryCard } from "@/components/StoryCard";
import { Timeline, type TimelinePersonInput, type TimelinePinInput } from "@/components/Timeline";
import {
  allStoriesWithVideo,
  allVideos,
  featuredStories,
  getStoryEntities,
  getTimelinePeople,
  getTimelinePins,
  personCount,
  storyCount,
  videoCount,
} from "@/lib/queries";
import {
  inferField,
  shortName,
  toStoryView,
  toEntityView,
  type EntityView,
  type Field,
} from "@/lib/view";
import type { Entity } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const people = getTimelinePeople();
  const pinsRaw = getTimelinePins();
  const stories = allStoriesWithVideo();
  const featured = featuredStories(3);
  const videos = allVideos();
  const totalStories = storyCount();
  const totalPeople = personCount();
  const totalVideos = videoCount();

  const timelinePeople: TimelinePersonInput[] = people
    .filter((p): p is typeof p & { birth_year: number; death_year: number } =>
      p.birth_year != null && p.death_year != null,
    )
    .map((p) => ({
      id: p.id,
      slug: p.slug ?? `e${p.id}`,
      name: p.name,
      short: shortName({ name: p.name, kind: "person" }),
      birth_year: p.birth_year,
      death_year: p.death_year,
      occupation: p.occupation,
      description: p.description,
      field: inferField(p.occupation),
    }));

  const timelinePins: TimelinePinInput[] = pinsRaw.map((p) => ({
    id: p.id,
    title: p.title ?? "Untitled",
    takeaway: p.takeaway,
    kind: p.kind,
    year: p.year,
    field: null,
  }));

  // Hydrate each story's entities + derived field list once on the server,
  // then ship the bundle to the client component for filtering.
  const records = stories.map((s) => {
    const ents = getStoryEntities(s.id);
    const entityViews: EntityView[] = ents.map((e) =>
      toEntityView(e as unknown as Entity),
    );
    const fields = Array.from(
      new Set<Field>(entityViews.map((e) => e.field)),
    );
    return {
      story: toStoryView(s),
      entities: entityViews,
      fields,
    };
  });

  const featuredRecords = featured.map((s) => {
    const ents = getStoryEntities(s.id);
    return {
      story: toStoryView(s),
      entities: ents.map((e) => toEntityView(e as unknown as Entity)),
    };
  });

  const videoList = videos.map((v) => ({
    id: v.id,
    title: v.title ?? `Video ${v.id}`,
  }));

  const earliestBirth = timelinePeople.length
    ? Math.min(...timelinePeople.map((p) => p.birth_year))
    : 1700;
  const earliestPin = timelinePins.length
    ? Math.min(...timelinePins.map((p) => p.year))
    : earliestBirth;
  const earliest = Math.min(earliestBirth, earliestPin);
  const span =
    timelinePeople.length || timelinePins.length
      ? `${Math.max(
          0,
          (timelinePeople.length
            ? Math.max(...timelinePeople.map((p) => p.death_year))
            : 2030) - earliest,
        )} years`
      : `${new Date().getUTCFullYear()} – present`;

  return (
    <main>
      <section className="shell hero">
        <div className="hero-eyebrow">
          <span className="dot" />
          <span className="smallcaps">The Lumen library · v0.2</span>
        </div>
        <h1 className="hero-title">
          A library of <em>story-moments</em> from the history of science.
        </h1>
        <p className="hero-sub">
          Distilled from long-form science video — the anecdotes, experiments, fun facts and
          unguarded quotes that make a discovery memorable. {totalStories} moments and counting,
          anchored to {totalPeople} people across {span}.
        </p>

        <Timeline
          people={timelinePeople}
          pins={timelinePins}
          storyCount={totalStories}
          videoCount={totalVideos}
        />
      </section>

      {featuredRecords.length > 0 && (
        <section className="shell" style={{ paddingTop: 56 }}>
          <div className="section-title">
            <h2>This week&apos;s reading</h2>
            <span className="st-aux">
              <Link href="/walk">Walk through everything →</Link>
            </span>
          </div>
          <div className="featured-grid">
            {featuredRecords.map((r) => (
              <StoryCard
                key={r.story.id}
                story={r.story}
                entities={r.entities}
                variant="featured"
              />
            ))}
          </div>
        </section>
      )}

      <HomeBody records={records} videos={videoList} />
    </main>
  );
}
