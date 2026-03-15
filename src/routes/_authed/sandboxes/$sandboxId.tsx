import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import { StatusPill } from '~/components/status-pill'
import {
  deleteSandbox,
  restartSandbox,
} from '~/features/sandboxes/server'

export const Route = createFileRoute('/_authed/sandboxes/$sandboxId')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.sandboxes.get, {
        sandboxId: params.sandboxId as Id<'sandboxes'>,
      }),
    )
  },
  component: SandboxDetailRoute,
})

function SandboxDetailRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = Route.useParams()
  const { data: sandbox } = useSuspenseQuery(
    convexQuery(api.sandboxes.get, {
      sandboxId: params.sandboxId as Id<'sandboxes'>,
    }),
  )
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshSandboxQueries() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.sandboxes.list, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.sandboxes.get, {
          sandboxId: params.sandboxId as Id<'sandboxes'>,
        }).queryKey,
      }),
    ])
  }

  async function handleDelete() {
    if (!sandbox) {
      return
    }

    setIsBusy(true)
    setError(null)

    try {
      await deleteSandbox({
        data: { sandboxId: sandbox._id },
      })
      await refreshSandboxQueries()
      await navigate({ to: '/dashboard' })
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete this sandbox.',
      )
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRestart() {
    if (!sandbox) {
      return
    }

    setIsBusy(true)
    setError(null)

    try {
      const restarted = await restartSandbox({
        data: { sandboxId: sandbox._id },
      })
      await refreshSandboxQueries()
      await navigate({
        to: '/sandboxes/$sandboxId',
        params: { sandboxId: restarted.sandboxId },
      })
    } catch (restartError) {
      setError(
        restartError instanceof Error
          ? restartError.message
          : 'Could not restart this sandbox.',
      )
    } finally {
      setIsBusy(false)
    }
  }

  if (!sandbox) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-white/65 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl">
        <h2 className="text-2xl font-semibold text-white">Workspace missing</h2>
        <p className="mt-3 max-w-xl text-sm leading-7">
          This sandbox no longer exists or you do not have access to it.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
        >
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <main className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              to="/dashboard"
              className="text-xs uppercase tracking-[0.24em] text-white/45"
            >
              Back to dashboard
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusPill status={sandbox.status} />
              <span className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-white/55">
                {sandbox.repoProvider}
              </span>
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-white">
              {sandbox.repoName}
            </h2>
            <p className="mt-3 max-w-3xl break-all text-sm leading-7 text-white/55">
              {sandbox.repoUrl}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRestart}
              disabled={isBusy}
              className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Restart workspace
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isBusy}
              className="rounded-full border border-rose-400/25 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete workspace
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">
              Branch
            </p>
            <p className="mt-2 text-sm font-medium text-white/85">
              {sandbox.repoBranch || 'default'}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">
              Workspace path
            </p>
            <p className="mt-2 break-all text-sm font-medium text-white/85">
              {sandbox.workspacePath || 'Provisioning workspace...'}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">
              Preview
            </p>
            {sandbox.previewUrl ? (
              <a
                href={sandbox.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-sm font-medium text-emerald-200 hover:text-emerald-100"
              >
                Open in a new tab
              </a>
            ) : (
              <p className="mt-2 text-sm font-medium text-white/55">
                Waiting for OpenCode to boot...
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-black/25 shadow-[0_24px_80px_rgba(5,8,20,0.42)]">
        {sandbox.previewUrl && sandbox.status === 'ready' ? (
          <div>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <p className="text-sm font-medium text-white/75">
                OpenCode web interface
              </p>
              <a
                href={sandbox.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-emerald-200 hover:text-emerald-100"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              title={`${sandbox.repoName} OpenCode workspace`}
              src={sandbox.previewUrl}
              className="h-[78vh] w-full bg-[#050816]"
            />
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center px-6 py-12 text-center text-white/55">
            <div className="max-w-xl">
              <h3 className="text-2xl font-semibold text-white">
                {sandbox.status === 'failed'
                  ? 'The workspace did not finish starting.'
                  : 'The workspace is still booting.'}
              </h3>
              <p className="mt-4 text-sm leading-7">
                {sandbox.errorMessage ||
                  'Once OpenCode is reachable, the embedded preview will appear here automatically. You can also restart the workspace if it looks stuck.'}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
