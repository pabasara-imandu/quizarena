import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-5 py-16">
      <div className="text-center">
        <span className="chip-brand mb-6">Live · real-time · one PIN</span>
        <h1 className="font-display text-6xl font-extrabold tracking-tight sm:text-7xl">
          Quiz<span className="text-brand-400">Arena</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-slate-400">
          Real-time classroom quizzing. One PIN, a hundred phones, a live leaderboard — and a server
          that owns the clock, so the scores are honest.
        </p>
      </div>

      <div className="mt-12 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/host"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">🎛️</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Host a quiz</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Build questions, open a room, and drive the session from a live dashboard with
            per-question analytics.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300">
            Open the dashboard
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>

        <Link
          href="/join"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">✋</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Join a quiz</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enter the 6-digit PIN your teacher is showing, pick a nickname, and play.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
            Enter a PIN
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>
      </div>

      <p className="mt-12 text-xs text-slate-600">
        Scoring, timing and answer validation all happen server-side.
      </p>
    </main>
  );
}
