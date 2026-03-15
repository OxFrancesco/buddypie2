import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { StatusPill } from '~/components/status-pill'
import { getSafeOpenCodeAgentPreset } from '~/lib/opencode/presets'
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
      <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
        <CardHeader>
          <CardTitle className="text-2xl font-black uppercase">
            Workspace missing
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            This sandbox no longer exists or you don't have access.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            asChild
            className="border-2 border-foreground bg-foreground font-black uppercase text-background shadow-[3px_3px_0_var(--accent)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          >
            <Link to="/dashboard">
              ← Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const preset = getSafeOpenCodeAgentPreset(sandbox.agentPresetId)
  const presetLabel = sandbox.agentLabel ?? preset.label
  const presetProvider = sandbox.agentProvider ?? preset.provider
  const presetModel = sandbox.agentModel ?? preset.model

  return (
    <main className="flex flex-col gap-6">
      <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-3">
              <Link
                to="/dashboard"
                className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                ← Dashboard
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={sandbox.status} />
                <Badge variant="outline" className="border-2 border-foreground font-bold uppercase tracking-widest">
                  {sandbox.repoProvider}
                </Badge>
                <Badge variant="outline" className="border-2 border-foreground font-bold uppercase tracking-widest">
                  {presetLabel}
                </Badge>
              </div>
              <CardTitle className="text-3xl font-black uppercase sm:text-4xl">
                {sandbox.repoName}
              </CardTitle>
              <p className="break-all text-sm text-muted-foreground">
                {sandbox.repoUrl}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleRestart}
                disabled={isBusy}
                className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Restart
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isBusy}
                className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4 border-2 border-foreground">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
            <div className="border-2 border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Branch
              </p>
              <p className="mt-2 font-bold">{sandbox.repoBranch || 'default'}</p>
            </div>
            <div className="border-2 border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Preset
              </p>
              <p className="mt-2 font-bold">{presetLabel}</p>
            </div>
            <div className="border-2 border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Model
              </p>
              <p className="mt-2 font-bold">
                {presetProvider} / {presetModel}
              </p>
            </div>
            <div className="border-2 border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Workspace
              </p>
              <p className="mt-2 break-all font-bold">
                {sandbox.workspacePath || 'Provisioning...'}
              </p>
            </div>
            <div className="border-2 border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Preview
              </p>
              {sandbox.previewUrl ? (
                <a
                  href={sandbox.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-bold text-accent-foreground underline decoration-2 underline-offset-4 hover:text-foreground"
                >
                  Open in new tab →
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Waiting for OpenCode...
                </p>
              )}
            </div>
          </div>

          {sandbox.initialPrompt ? (
            <div className="mt-4 border-2 border-dashed border-foreground bg-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Kickoff Prompt
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {sandbox.initialPrompt}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="border-2 border-foreground bg-card shadow-[4px_4px_0_var(--foreground)]">
        {sandbox.previewUrl && sandbox.status === 'ready' ? (
          <div>
            <div className="flex items-center justify-between border-b-2 border-foreground px-5 py-3">
              <p className="text-sm font-black uppercase tracking-widest">
                OpenCode
              </p>
              <a
                href={sandbox.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-bold underline decoration-2 underline-offset-4"
              >
                New tab →
              </a>
            </div>
            <iframe
              title={`${sandbox.repoName} OpenCode workspace`}
              src={sandbox.previewUrl}
              className="h-[78vh] w-full bg-background"
            />
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center p-12 text-center">
            <div className="max-w-md">
              <h3 className="text-2xl font-black uppercase">
                {sandbox.status === 'failed'
                  ? 'Workspace failed.'
                  : 'Booting workspace...'}
              </h3>
              <p className="mt-4 text-sm text-muted-foreground">
                {sandbox.errorMessage ||
                  'The embedded preview will appear here once OpenCode is reachable. Try restarting if stuck.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
