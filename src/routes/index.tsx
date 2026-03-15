import { SignInButton } from '@clerk/tanstack-react-start'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.userId) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Home,
})

function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.16),transparent_30%)]" />

      <section className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/8 px-4 py-1.5 text-[11px] uppercase tracking-[0.32em] text-emerald-100/80">
            BuddyPie x OpenCode
          </div>

          <h1 className="mt-8 text-5xl font-semibold tracking-[-0.05em] text-white sm:text-7xl">
            Launch repo-native coding sandboxes from one calm dashboard.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 sm:text-xl">
            Sign in with Clerk, sync your account into Convex, import a public
            repository or a private GitHub repo, and open a live OpenCode
            workspace inside Daytona in a single flow.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
              >
                Sign in to dashboard
              </button>
            </SignInButton>
            <a
              href="https://opencode.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/90 transition hover:border-white/30 hover:bg-white/6"
            >
              OpenCode docs
            </a>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            'Authenticated dashboard with Clerk and Convex-backed user records.',
            'Daytona sandbox creation, repo cloning, and OpenCode web boot.',
            'Private GitHub support through Clerk-managed OAuth tokens.',
          ].map((item) => (
            <div
              key={item}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/70 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
