import { NextResponse } from "next/server";
import { similarStories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("story_id");
  const kStr = searchParams.get("k");
  const id = idStr != null ? Number(idStr) : NaN;
  const k = kStr != null ? Math.min(50, Math.max(1, Number(kStr))) : 8;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ results: [], error: "story_id required" }, { status: 400 });
  }
  const results = similarStories(id, k);
  return NextResponse.json({ results });
}
