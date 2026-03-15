import type { FormEvent } from 'react'
import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import { SandboxCard } from '~/components/sandbox-card'
import {
  checkGithubConnection,
  createSandbox,
  deleteSandbox,
  restartSandbox,
} from '~/features/sandboxes/server'

export const Route = createFileRoute('/_authed/dashboard')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.user.current, {})),
      context.queryClient.ensureQueryData(convexQuery(api.sandboxes.list, {})),
    ])

    const github = await checkGithubConnection()

    return {
      github,
    }
  },
  component: DashboardRoute,
})

function DashboardRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { github } = Route.useLoaderData()
  const { data: user } = useSuspenseQuery(convexQuery(api.user.current, {}))
  const { data: sandboxes } = useSuspenseQuery(convexQuery(api.sandboxes.list, {}))
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [busySandboxId, setBusySandboxId] = useState<string | null>(null)

  async function refreshDashboard() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.user.current, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.sandboxes.list, {}).queryKey,
      }),
    ])
  }

  async function handleCreateSandbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setActionError(null)
    setIsCreating(true)

    try {
      const result = await createSandbox({
        data: {
          repoUrl,
          branch,
        },
      })

      setRepoUrl('')
      setBranch('')
      await refreshDashboard()
      await navigate({
        to: '/sandboxes/$sandboxId',
        params: { sandboxId: result.sandboxId },
      })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Sandbox creation failed.')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteSandbox(sandboxId: string) {
    setBusySandboxId(sandboxId)
    setActionError(null)

    try {
      await deleteSandbox({
        data: { sandboxId },
      })
      await refreshDashboard()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Sandbox deletion failed.')
    } finally {
      setBusySandboxId(null)
    }
  }

  async function handleRestartSandbox(sandboxId: string) {
    setBusySandboxId(sandboxId)
    setActionError(null)

    try {
      const result = await restartSandbox({
        data: { sandboxId },
      })
      await refreshDashboard()
      await navigate({
        to: '/sandboxes/$sandboxId',
        params: { sandboxId: result.sandboxId },
      })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Sandbox restart failed.')
    } finally {
      setBusySandboxId(null)
    }
  }

  const userLabel = user?.name ?? user?.email ?? 'builder'

  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-100/75">
            Live workspace launcher
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">
            Welcome back, {userLabel}.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">
            Paste an HTTPS repository URL, choose an optional branch, and
            BuddyPie will spin up a Daytona sandbox with the stock OpenCode web
            interface pointed at that repo.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleCreateSandbox}>
            <div>
              <label
                htmlFor="repo-url"
                className="text-xs uppercase tracking-[0.24em] text-white/45"
              >
                Repository URL
              </label>
              <input
                id="repo-url"
                type="url"
                required
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repo.git"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/45 focus:bg-black/30"
              />
            </div>

            <div>
              <label
                htmlFor="branch"
                className="text-xs uppercase tracking-[0.24em] text-white/45"
              >
                Branch
              </label>
              <input
                id="branch"
                type="text"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/45 focus:bg-black/30"
              />
            </div>

            {formError ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {formError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isCreating}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? 'Launching sandbox...' : 'Create sandbox'}
              </button>
              <p className="text-sm text-white/45">
                Public Git URLs work immediately. Private GitHub repos require a
                connected GitHub account in Clerk.
              </p>
            </div>
          </form>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">
              GitHub connection
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${github.connected ? 'bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]' : 'bg-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.8)]'}`}
              />
              <p className="text-sm text-white/75">{github.message}</p>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/50">
              Open your profile menu in the top-right corner to refresh GitHub
              access with the extra `repo` scope when you need private imports.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">
              Flow
            </p>
            <ol className="mt-4 space-y-3 text-sm leading-7 text-white/60">
              <li>1. BuddyPie syncs your Clerk identity into Convex.</li>
              <li>2. Daytona clones the repository into a fresh sandbox.</li>
              <li>3. OpenCode boots its web UI on top of that workspace.</li>
            </ol>
          </div>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">
              Saved sandboxes
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Your active workspaces
            </h3>
          </div>
          <p className="text-sm text-white/45">
            {sandboxes.length} sandbox{sandboxes.length === 1 ? '' : 'es'}
          </p>
        </div>

        {actionError ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {actionError}
          </div>
        ) : null}

        {sandboxes.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center text-white/55">
            Your first sandbox will appear here as soon as you launch one.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {sandboxes.map((sandbox) => (
              <SandboxCard
                key={sandbox._id}
                sandbox={sandbox}
                isBusy={busySandboxId === sandbox._id}
                onDelete={() => handleDeleteSandbox(sandbox._id)}
                onRestart={() => handleRestartSandbox(sandbox._id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
