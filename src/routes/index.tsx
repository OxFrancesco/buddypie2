import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

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
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-5xl font-black uppercase leading-none tracking-tight sm:text-7xl">
          Coding sandboxes.
          <br />
          One dashboard.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Sign in, pick a repo, get a live agent workspace inside a sandbox and make
          your changes. No config, no waiting, only vibing!
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button
            asChild
            className="h-12 border-2 border-foreground bg-foreground px-8 text-sm font-black uppercase tracking-wider text-background shadow-[4px_4px_0_var(--foreground)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          >
            <Link to="/dashboard">Sign in →</Link>
          </Button>
          <a
            href="https://opencode.ai/docs"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" className="h-12 border-2 border-foreground px-8 text-sm font-black uppercase tracking-wider shadow-[4px_4px_0_var(--foreground)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
              Docs
            </Button>
          </a>
        </div>
      </div>
    </main>
  )
}
