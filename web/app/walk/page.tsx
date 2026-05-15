import { WalkClient, type WalkStory } from "@/components/WalkClient";
import { allStoriesWithVideo, getStoryEntities } from "@/lib/queries";
import type { Entity } from "@/lib/types";
import { toEntityView, toStoryView } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function WalkPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const params = await searchParams;
  const raw = allStoriesWithVideo();
  const stories: WalkStory[] = raw.map((s) => ({
    story: toStoryView(s),
    entities: getStoryEntities(s.id).map((e) => toEntityView(e as unknown as Entity)),
  }));
  const requestedIndex = Number.parseInt(params.i ?? "0", 10);
  const initialIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;
  return <WalkClient stories={stories} initialIndex={initialIndex} />;
}
