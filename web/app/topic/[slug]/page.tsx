export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="shell" style={{ padding: "64px 0" }}>
      <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-mute)" }}>
        Topic {slug} — out of scope for current redesign.
      </p>
    </main>
  );
}
