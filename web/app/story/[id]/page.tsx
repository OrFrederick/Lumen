export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="shell" style={{ padding: "64px 0" }}>
      <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-mute)" }}>
        Story {id} — page redesign in flight.
      </p>
    </main>
  );
}
