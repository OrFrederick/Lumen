import Link from "next/link";
import { notFound } from "next/navigation";
import StoryCard from "@/components/StoryCard";
import { getEntityStories, getPersonBySlug } from "@/lib/queries";
import type { StoryWithVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PersonPage({ params }: PageProps) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);
  if (!person) notFound();

  const stories = getEntityStories(person.id);
  const grouped = new Map<string, StoryWithVideo[]>();
  for (const s of stories) {
    const key = s.video_id;
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }

  return (
    <article className="space-y-6">
      <header className="flex gap-5 items-start">
        {person.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.image_url}
            alt={person.name}
            className="w-28 h-28 rounded object-cover border border-current/10"
          />
        ) : null}
        <div className="space-y-1">
          <div className="text-xs opacity-60 uppercase tracking-wider">
            {person.kind}
            {person.occupation ? ` · ${person.occupation}` : ""}
          </div>
          <h1 className="text-3xl font-semibold leading-tight">{person.name}</h1>
          {(person.birth_year || person.death_year) && (
            <div className="text-sm opacity-70">
              {person.birth_year ?? "?"}–{person.death_year ?? "present"}
            </div>
          )}
          {person.description ? (
            <p className="text-sm opacity-90 max-w-2xl pt-2">{person.description}</p>
          ) : null}
          {person.wikipedia_url ? (
            <Link
              href={person.wikipedia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline-offset-2 hover:underline"
            >
              Wikipedia →
            </Link>
          ) : null}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Stories featuring {person.name}</h2>
        {grouped.size === 0 ? (
          <p className="text-sm opacity-60">No stories yet.</p>
        ) : (
          [...grouped.entries()].map(([videoId, items]) => (
            <div key={videoId} className="space-y-2">
              <h3 className="text-sm font-semibold opacity-80">
                <Link href={`/video/${videoId}`} className="hover:underline">
                  {items[0]?.video_title ?? videoId}
                </Link>
              </h3>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((s) => (
                  <li key={s.id}>
                    <StoryCard story={s} compact />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </article>
  );
}
