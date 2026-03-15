import { SignIn, UserButton } from '@clerk/tanstack-react-start'
import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
} from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    const location = useLocation()

    if (error.message === 'Not authenticated') {
      return (
        <div className="flex items-center justify-center p-12">
          <SignIn routing="hash" forceRedirectUrl={location.href} />
        </div>
      )
    }

    throw error
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.14),transparent_26%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-8 sm:py-8">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                to="/dashboard"
                className="text-sm uppercase tracking-[0.3em] text-emerald-100/75"
              >
                BuddyPie
              </Link>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                OpenCode sandboxes
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-white/55">
                Import repositories, launch Daytona-backed OpenCode sessions,
                and jump into a live editing workspace.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                activeProps={{
                  className:
                    'rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950',
                }}
                activeOptions={{ exact: true }}
                className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/6"
              >
                Dashboard
              </Link>
              <UserButton
                userProfileProps={{
                  additionalOAuthScopes: {
                    github: ['repo'],
                  },
                }}
              />
            </div>
          </div>
        </header>

        <div className="mt-6 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
