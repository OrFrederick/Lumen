import { NextResponse } from "next/server";
import { searchPeople, searchStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  // FTS5: quote the term to escape punctuation, append trailing wildcard so
  // partial words match (e.g. "ein" → "Einstein").
  const ftsQuery = `"${q.replace(/"/g, '""')}"*`;
  const stories = searchStories(ftsQuery, 12).map((s) => ({
    kind: "story" as const,
    id: s.id,
    title: s.snippet || s.title || "Untitled",
    story_kind: null as string | null,
  }));

  const people = searchPeople(q, 6).map((p) => ({
    kind: "person" as const,
    slug: p.slug ?? `e${p.id}`,
    name: p.name,
    birth_year: p.birth_year,
    death_year: p.death_year,
  }));

  // Interleave: people first (typically fewer + higher signal), then stories.
  const results = [...people, ...stories].slice(0, 8);
  return NextResponse.json({ results });
}
