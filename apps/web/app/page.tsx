const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export default function HomePage() {
  return (
    <main style={{ padding: '4rem 2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>FairPlay Party DJ</h1>
      <p style={{ opacity: 0.8, marginBottom: '2rem' }}>
        Milestone 1 placeholder. Frontend MVP lands in Milestone 17.
      </p>
      <section
        style={{
          padding: '1.5rem',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>API status</h2>
        <p style={{ margin: '0.25rem 0' }}>
          Configured API base URL: <code>{API_BASE}</code>
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          Try <code>{API_BASE}/health</code> while the API is running.
        </p>
      </section>
    </main>
  );
}
