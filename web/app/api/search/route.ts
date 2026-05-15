import { NextResponse } from "next/server";
import { searchStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  // Escape FTS5 special syntax minimally: wrap in quotes if it doesn't already
  // contain FTS operators. Simple, predictable behavior.
  const safe = /[":^*]/.test(q) ? q : `"${q.replace(/"/g, '""')}"`;
  try {
    const results = searchStories(safe, 20);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: (err as Error).message },
      { status: 200 },
    );
  }
}
