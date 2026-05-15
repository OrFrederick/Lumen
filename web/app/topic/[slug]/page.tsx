import { notFound } from "next/navigation";
import StoryCard from "@/components/StoryCard";
import { getTopicBySlug, getTopicStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TopicPage({ params }: PageProps) {
  const { slug } = await params;
  const topic = getTopicBySlug(slug);
  if (!topic) notFound();
  const stories = getTopicStories(topic.id);

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs opacity-60 uppercase tracking-wider">
          topic{topic.field ? ` · ${topic.field}` : ""}
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{topic.name}</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Stories in {topic.name}</h2>
        {stories.length === 0 ? (
          <p className="text-sm opacity-60">No stories yet.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {stories.map((s) => (
              <li key={s.id}>
                <StoryCard story={s} compact />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
