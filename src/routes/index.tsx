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
          Coding Agents.
          <br />
          One dashboard.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Sign in, pick a repo, get a live agent inside a sandbox and make
          your changes. No config, no waiting, only vibing!
        </p>

        <div className="mt-10 flex items-center">
          <div className="group relative inline-flex">
            <span className="peer inline-block">
              <Button
                asChild
                className="relative h-12 overflow-hidden border-2 border-foreground bg-foreground px-8 text-sm font-black uppercase tracking-wider text-background shadow-[4px_4px_0_var(--foreground)] transition-all before:absolute before:inset-0 before:z-0 before:origin-left before:scale-x-0 before:bg-[#FFD12D] before:transition-transform before:duration-300 before:ease-out hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none hover:before:scale-x-100 hover:text-foreground"
              >
                <Link to="/dashboard">
                <span className="relative z-10">Sign in →</span>
              </Link>
              </Button>
            </span>
            <img
              src="/logo.svg"
              alt="BuddyPie"
              className="pointer-events-none absolute left-full top-1/2 ml-3 h-16 w-auto -translate-y-1/2 opacity-0 transition-opacity duration-300 ease-out peer-hover:opacity-100 group-hover:opacity-100 sm:h-20"
            />
          </div>
        </div>
      </div>
    </main>
  )
}
