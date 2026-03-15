import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import type { ChangeEvent, FormEvent } from 'react'
import type { GithubRepoOption } from '~/features/sandboxes/server'
import { SandboxCard } from '~/components/sandbox-card'
import {
  checkGithubConnection,
  createSandbox,
  deleteSandbox,
  listGithubBranches,
  listGithubRepos,
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
  const [githubRepos, setGithubRepos] = useState<Array<GithubRepoOption>>([])
  const [githubBranches, setGithubBranches] = useState<Array<string>>([])
  const [githubPickerError, setGithubPickerError] = useState<string | null>(null)
  const [hasLoadedGithubRepos, setHasLoadedGithubRepos] = useState(false)
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false)
  const [isLoadingGithubBranches, setIsLoadingGithubBranches] = useState(false)
  const [selectedGithubRepoFullName, setSelectedGithubRepoFullName] = useState<
    string | null
  >(null)

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

  async function loadGithubBranchesForRepo(repo: GithubRepoOption) {
    setSelectedGithubRepoFullName(repo.fullName)
    setIsLoadingGithubBranches(true)
    setGithubPickerError(null)

    try {
      const branches = await listGithubBranches({
        data: {
          repoFullName: repo.fullName,
        },
      })

      setGithubBranches(branches)
    } catch (error) {
      setGithubBranches([])
      setGithubPickerError(
        error instanceof Error ? error.message : 'Could not load GitHub branches.',
      )
    } finally {
      setIsLoadingGithubBranches(false)
    }
  }

  function applyGithubRepo(repo: GithubRepoOption) {
    setRepoUrl(repo.cloneUrl)
    setBranch(repo.defaultBranch)
    void loadGithubBranchesForRepo(repo)
  }

  async function handleLoadGithubRepos() {
    setGithubPickerError(null)
    setIsLoadingGithubRepos(true)

    try {
      const repos = await listGithubRepos()
      setGithubRepos(repos)
      setHasLoadedGithubRepos(true)

      const matchedRepo = repos.find((repo) => repo.cloneUrl === repoUrl)

      if (matchedRepo) {
        setBranch((currentBranch) => currentBranch || matchedRepo.defaultBranch)
        void loadGithubBranchesForRepo(matchedRepo)
      }
    } catch (error) {
      setGithubPickerError(
        error instanceof Error ? error.message : 'Could not load GitHub repositories.',
      )
    } finally {
      setIsLoadingGithubRepos(false)
    }
  }

  function handleRepoUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRepoUrl = event.target.value
    const matchedRepo = githubRepos.find((repo) => repo.cloneUrl === nextRepoUrl)

    setFormError(null)
    setGithubPickerError(null)
    setRepoUrl(nextRepoUrl)

    if (!matchedRepo) {
      setSelectedGithubRepoFullName(null)
      setGithubBranches([])
      return
    }

    applyGithubRepo(matchedRepo)
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
      setSelectedGithubRepoFullName(null)
      setGithubBranches([])
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
            Paste an HTTPS repository URL or fetch one from GitHub, choose an
            optional branch, and BuddyPie will spin up a Daytona sandbox with
            the stock OpenCode web interface pointed at that repo.
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
                list={githubRepos.length > 0 ? 'github-repo-options' : undefined}
                value={repoUrl}
                onChange={handleRepoUrlChange}
                placeholder="https://github.com/owner/repo.git"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/45 focus:bg-black/30"
              />

              {github.connected ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleLoadGithubRepos()
                    }}
                    disabled={isLoadingGithubRepos}
                    className="rounded-full border border-white/12 px-4 py-2 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingGithubRepos
                      ? 'Fetching GitHub repos...'
                      : hasLoadedGithubRepos
                        ? 'Refresh GitHub repos'
                        : 'Fetch GitHub repos'}
                  </button>
                  <p className="text-xs text-white/45">
                    {hasLoadedGithubRepos
                      ? githubRepos.length > 0
                        ? `${githubRepos.length} repo${githubRepos.length === 1 ? '' : 's'} available as suggestions.`
                        : 'No repositories were found on this GitHub connection.'
                      : 'Load your connected GitHub repositories to autocomplete this field.'}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/45">
                  Connect GitHub in Clerk to browse your repositories here.
                </p>
              )}
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
                list={githubBranches.length > 0 ? 'github-branch-options' : undefined}
                value={branch}
                onChange={(event) => {
                  setFormError(null)
                  setBranch(event.target.value)
                }}
                placeholder="main"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/45 focus:bg-black/30"
              />
              <p className="mt-3 text-xs text-white/45">
                {isLoadingGithubBranches
                  ? 'Fetching branches from GitHub...'
                  : selectedGithubRepoFullName && githubBranches.length > 0
                    ? `${githubBranches.length} branch suggestion${githubBranches.length === 1 ? '' : 's'} loaded from ${selectedGithubRepoFullName}.`
                    : selectedGithubRepoFullName
                      ? `No branch suggestions were found for ${selectedGithubRepoFullName}.`
                      : 'Leave blank to use the repository default branch.'}
              </p>
            </div>

            {githubRepos.length > 0 ? (
              <datalist id="github-repo-options">
                {githubRepos.map((repo) => (
                  <option
                    key={repo.id}
                    value={repo.cloneUrl}
                    label={`${repo.fullName} (${repo.private ? 'private' : 'public'})`}
                  />
                ))}
              </datalist>
            ) : null}

            {githubBranches.length > 0 ? (
              <datalist id="github-branch-options">
                {githubBranches.map((branchName) => (
                  <option key={branchName} value={branchName} />
                ))}
              </datalist>
            ) : null}

            {githubPickerError ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {githubPickerError}
              </div>
            ) : null}

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
                Public Git URLs work immediately. Connected GitHub accounts can
                browse private repositories and prefill the branch field.
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
