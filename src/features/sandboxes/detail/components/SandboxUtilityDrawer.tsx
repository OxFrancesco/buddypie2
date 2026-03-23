import type { Dispatch, SetStateAction } from 'react'
import { Link } from '@tanstack/react-router'
import type { SandboxArtifactReadResult } from '~/lib/artifacts'
import { SandboxArtifactRenderer } from '~/components/sandbox-artifact-renderer'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
  formatDateTime,
  isValidPreviewPort,
  QUICK_PREVIEW_PORTS,
} from '../utils'
import type {
  PreviewCommandSuggestionResult,
  SandboxDetailRecord,
  UtilityDrawerTab,
} from '../types'
import { APP_PREVIEW_PORT_MAX, APP_PREVIEW_PORT_MIN } from '../utils'
import {
  isX402SandboxPaymentMethod,
  type SandboxPaymentMethod,
} from '~/lib/sandboxes'

type ArtifactState = {
  result?: SandboxArtifactReadResult
  isLoading: boolean
  error: unknown
}

export function SandboxUtilityDrawer(props: {
  sandbox: SandboxDetailRecord
  isOpen: boolean
  onClose: () => void
  utilityDrawerTab: UtilityDrawerTab
  setUtilityDrawerTab: (tab: UtilityDrawerTab) => void
  handlePanelSwipeStart: (touchX: number) => void
  handlePanelSwipeEnd: (touchX: number) => void
  artifact: ArtifactState
  paymentMethod: SandboxPaymentMethod
  hasActiveDelegatedBudget: boolean
  preview: {
    previewPort: string
    setPreviewPort: (value: string) => void
    isPreviewBooting: boolean
    previewBootError: string | null
    effectivePreviewAppPath: string | null
    showManualPreviewFallback: boolean
    previewCommandSuggestion: PreviewCommandSuggestionResult | null
    previewCommandSuggestionError: string | null
    isPreviewCommandSuggestionLoading: boolean
    previewLogs: string
    previewLogPath: string | null
    previewLogsError: string | null
    isPreviewLogsLoading: boolean
    setPreviewLogsRequestNonce: Dispatch<SetStateAction<number>>
    appPreviewUrl: string | null
    appPreviewIframeUrl: string | null
    setHasPreviewIframeLoaded: (loaded: boolean) => void
    retryPreviewBoot: () => Promise<void>
  }
  terminal: {
    terminalAccessError: string | null
    webTerminalError: string | null
    webTerminalUrl: string | null
    sshCommand: string | null
    sshExpiresAt: string | null
    isWebTerminalLoading: boolean
    isTerminalAccessLoading: boolean
    handleOpenWebTerminal: () => Promise<void>
    handleCreateTerminalAccess: () => Promise<void>
  }
}) {
  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity ${
        props.isOpen
          ? 'pointer-events-auto bg-black/45 opacity-100'
          : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        type="button"
        className="absolute inset-0"
        onClick={props.onClose}
        aria-label="Close sandbox utilities panel"
      />

      <aside
        className={`absolute right-0 top-0 h-full w-[min(92vw,560px)] border-l-2 border-foreground bg-background shadow-[-6px_0_0_var(--foreground)] transition-transform duration-300 ${
          props.isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onTouchStart={(event) =>
          props.handlePanelSwipeStart(event.touches[0]?.clientX ?? 0)
        }
        onTouchEnd={(event) =>
          props.handlePanelSwipeEnd(event.changedTouches[0]?.clientX ?? 0)
        }
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b-2 border-foreground px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Sandbox Utilities
              </p>
              <p className="mt-1 text-sm font-bold">
                Swipe right or tap outside to close
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={props.onClose}
              className="border-2 border-foreground text-xs font-black uppercase"
            >
              Close
            </Button>
          </div>

          <div className="border-b-2 border-foreground bg-muted px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => props.setUtilityDrawerTab('artifacts')}
                className={`rounded-md border-2 px-3 py-2 text-xs font-black uppercase tracking-widest ${
                  props.utilityDrawerTab === 'artifacts'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-foreground bg-background text-foreground'
                }`}
              >
                Artifacts
              </button>
              <button
                type="button"
                onClick={() => props.setUtilityDrawerTab('preview')}
                className={`rounded-md border-2 px-3 py-2 text-xs font-black uppercase tracking-widest ${
                  props.utilityDrawerTab === 'preview'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-foreground bg-background text-foreground'
                }`}
              >
                App Preview
              </button>
            </div>
          </div>

          {props.utilityDrawerTab === 'artifacts' ? (
            <ArtifactsPane sandbox={props.sandbox} artifact={props.artifact} />
          ) : (
            <PreviewPane
              sandbox={props.sandbox}
              paymentMethod={props.paymentMethod}
              hasActiveDelegatedBudget={props.hasActiveDelegatedBudget}
              preview={props.preview}
              terminal={props.terminal}
            />
          )}
        </div>
      </aside>
    </div>
  )
}

function ArtifactsPane(props: {
  sandbox: SandboxDetailRecord
  artifact: ArtifactState
}) {
  return (
    <>
      <div className="border-b-2 border-foreground bg-muted px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Live Artifact Manifest
        </p>
        <p className="mt-2 break-all text-xs font-bold">
          .buddypie/artifacts/current.json
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          BuddyPie polls this sandbox-local manifest and replaces the rendered
          artifact whenever the file changes.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-card p-4">
        {props.sandbox.status !== 'ready' ? (
          <div className="flex h-full min-h-[260px] items-center justify-center text-center">
            <div className="max-w-sm">
              <p className="text-sm font-black uppercase">
                Artifact rail not ready yet
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                BuddyPie will start polling the artifact manifest once the
                sandbox is ready.
              </p>
            </div>
          </div>
        ) : props.artifact.isLoading && !props.artifact.result ? (
          <div className="flex h-full min-h-[260px] items-center justify-center text-center">
            <div className="max-w-sm">
              <p className="text-sm font-black uppercase">
                Loading artifact...
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Reading the current manifest from the sandbox.
              </p>
            </div>
          </div>
        ) : props.artifact.error ? (
          <Alert variant="destructive" className="border-2 border-foreground">
            <AlertDescription>
              {props.artifact.error instanceof Error
                ? props.artifact.error.message
                : 'Could not load the current artifact manifest.'}
            </AlertDescription>
          </Alert>
        ) : props.artifact.result?.status === 'invalid' ? (
          <div className="space-y-4">
            <Alert variant="destructive" className="border-2 border-foreground">
              <AlertDescription>{props.artifact.result.error}</AlertDescription>
            </Alert>
            <div className="rounded-md border-2 border-foreground bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Manifest Path
              </p>
              <p className="mt-2 break-all text-xs font-bold">
                {props.artifact.result.manifestPath}
              </p>
            </div>
            <div className="rounded-md border-2 border-foreground bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Raw Content
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-foreground/30 bg-muted p-2 text-[11px]">
                {props.artifact.result.rawContent}
              </pre>
            </div>
          </div>
        ) : props.artifact.result?.status === 'ready' ? (
          <div className="space-y-4">
            <div className="rounded-md border-2 border-foreground bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Current Artifact
                  </p>
                  <p className="mt-2 text-lg font-black uppercase">
                    {props.artifact.result.manifest.title}
                  </p>
                  {props.artifact.result.manifest.summary ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {props.artifact.result.manifest.summary}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Generated
                  </p>
                  <p className="mt-2 text-xs font-bold">
                    {formatDateTime(
                      props.artifact.result.manifest.generatedAt,
                    ) ?? props.artifact.result.manifest.generatedAt}
                  </p>
                </div>
              </div>
              <p className="mt-3 break-all text-[11px] text-muted-foreground">
                {props.artifact.result.manifestPath}
              </p>
            </div>

            <div className="rounded-md border-2 border-foreground bg-background p-4">
              <SandboxArtifactRenderer
                manifest={props.artifact.result.manifest}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] items-center justify-center text-center">
            <div className="max-w-sm">
              <p className="text-sm font-black uppercase">
                No artifact published
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                The agent has not created{' '}
                <code>.buddypie/artifacts/current.json</code> yet, or it already
                deleted the artifact because it was no longer useful.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function PreviewPane(props: {
  sandbox: SandboxDetailRecord
  paymentMethod: SandboxPaymentMethod
  hasActiveDelegatedBudget: boolean
  preview: {
    previewPort: string
    setPreviewPort: (value: string) => void
    isPreviewBooting: boolean
    previewBootError: string | null
    effectivePreviewAppPath: string | null
    showManualPreviewFallback: boolean
    previewCommandSuggestion: PreviewCommandSuggestionResult | null
    previewCommandSuggestionError: string | null
    isPreviewCommandSuggestionLoading: boolean
    previewLogs: string
    previewLogPath: string | null
    previewLogsError: string | null
    isPreviewLogsLoading: boolean
    setPreviewLogsRequestNonce: React.Dispatch<React.SetStateAction<number>>
    appPreviewUrl: string | null
    appPreviewIframeUrl: string | null
    setHasPreviewIframeLoaded: (loaded: boolean) => void
    retryPreviewBoot: () => Promise<void>
  }
  terminal: {
    terminalAccessError: string | null
    webTerminalError: string | null
    webTerminalUrl: string | null
    sshCommand: string | null
    sshExpiresAt: string | null
    isWebTerminalLoading: boolean
    isTerminalAccessLoading: boolean
    handleOpenWebTerminal: () => Promise<void>
    handleCreateTerminalAccess: () => Promise<void>
  }
}) {
  return (
    <>
      <div className="border-b-2 border-foreground bg-muted px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Preview Port
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_PREVIEW_PORTS.map((port) => (
            <button
              key={port}
              type="button"
              onClick={() => props.preview.setPreviewPort(port)}
              className={`rounded-md border-2 px-2 py-1 text-xs font-black uppercase ${
                props.preview.previewPort === port
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-foreground bg-background'
              }`}
            >
              {port}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Custom Port
        </label>
        <input
          value={props.preview.previewPort}
          onChange={(event) => props.preview.setPreviewPort(event.target.value)}
          inputMode="numeric"
          className="mt-1 w-full border-2 border-foreground bg-background px-3 py-2 text-sm font-bold"
          placeholder="5173"
        />
        {!isValidPreviewPort(props.preview.previewPort) ? (
          <p className="mt-2 text-xs text-destructive">
            Enter a valid port between {APP_PREVIEW_PORT_MIN} and{' '}
            {APP_PREVIEW_PORT_MAX}.
          </p>
        ) : null}

        <div className="mt-4 rounded-md border-2 border-foreground bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Preview action
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isX402SandboxPaymentMethod(props.paymentMethod)
                  ? `x402 only prompts when you explicitly request a boot.`
                  : `Opening this tab auto-boots the preview from your selected rail when needed.`}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void props.preview.retryPreviewBoot()}
              disabled={
                props.preview.isPreviewBooting ||
                !isValidPreviewPort(props.preview.previewPort)
              }
              className="h-7 border-2 border-foreground px-2 text-[10px] font-black uppercase"
            >
              {props.preview.isPreviewBooting
                ? isX402SandboxPaymentMethod(props.paymentMethod)
                  ? 'Waiting for wallet...'
                  : props.paymentMethod === 'delegated_budget'
                    ? 'Settling budget...'
                    : 'Booting...'
                : isX402SandboxPaymentMethod(props.paymentMethod)
                  ? 'Pay and boot'
                  : props.paymentMethod === 'delegated_budget'
                    ? 'Use budget and boot'
                    : 'Retry boot'}
            </Button>
          </div>
          {props.preview.isPreviewBooting ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Starting the preview server on port {props.preview.previewPort}...
            </p>
          ) : null}
          {props.preview.previewBootError ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-destructive">
                {props.preview.previewBootError}
              </p>
              {props.paymentMethod === 'delegated_budget' &&
              !props.hasActiveDelegatedBudget ? (
                <Link
                  to="/profile"
                  hash="delegated-budget"
                  className="inline-flex h-8 items-center justify-center border-2 border-foreground bg-foreground px-3 text-[10px] font-black uppercase tracking-wider text-background shadow-[2px_2px_0_var(--accent)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                >
                  Go to wallet
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-md border-2 border-foreground bg-background p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Preview Target
          </p>
          <p className="mt-2 break-all text-xs font-bold">
            {props.preview.effectivePreviewAppPath ??
              'Resolving preview app path...'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Docs sandboxes target the generated docs app. Other sandboxes target
            the main app workspace.
          </p>
        </div>

        {props.preview.showManualPreviewFallback ? (
          <div className="mt-4 rounded-md border-2 border-foreground bg-accent/15 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Preview taking longer than 10s
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open the Daytona terminal and run the dev server yourself.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.terminal.handleOpenWebTerminal()}
                disabled={props.terminal.isWebTerminalLoading}
                className="h-7 border-2 border-foreground px-2 text-[10px] font-black uppercase"
              >
                {props.terminal.isWebTerminalLoading
                  ? isX402SandboxPaymentMethod(props.paymentMethod)
                    ? 'Waiting...'
                    : 'Opening...'
                  : 'Open Terminal'}
              </Button>
            </div>
            {props.preview.isPreviewCommandSuggestionLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Preparing a suggested command...
              </p>
            ) : null}
            {props.preview.previewCommandSuggestion ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Suggested command for{' '}
                  {props.preview.previewCommandSuggestion.packageManager}
                  {' / '}
                  {props.preview.previewCommandSuggestion.framework}
                  {' / '}
                  {props.preview.previewCommandSuggestion.previewScript}
                </p>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-foreground/30 bg-background p-2 text-[11px]">
                  {props.preview.previewCommandSuggestion.command}
                </pre>
              </div>
            ) : null}
            {props.preview.previewCommandSuggestionError ? (
              <p className="mt-2 text-xs text-destructive">
                {props.preview.previewCommandSuggestionError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-md border-2 border-foreground bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Daytona Terminal
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.terminal.handleOpenWebTerminal()}
                disabled={props.terminal.isWebTerminalLoading}
                className="h-7 border-2 border-foreground px-2 text-[10px] font-black uppercase"
              >
                {props.terminal.isWebTerminalLoading
                  ? isX402SandboxPaymentMethod(props.paymentMethod)
                    ? 'Waiting...'
                    : 'Opening...'
                  : 'Web Terminal'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.terminal.handleCreateTerminalAccess()}
                disabled={props.terminal.isTerminalAccessLoading}
                className="h-7 border-2 border-foreground px-2 text-[10px] font-black uppercase"
              >
                {props.terminal.isTerminalAccessLoading
                  ? isX402SandboxPaymentMethod(props.paymentMethod)
                    ? 'Waiting...'
                    : 'Creating...'
                  : 'Generate SSH'}
              </Button>
            </div>
          </div>
          {props.terminal.terminalAccessError ? (
            <p className="mt-2 text-xs text-destructive">
              {props.terminal.terminalAccessError}
            </p>
          ) : null}
          {props.terminal.webTerminalError ? (
            <p className="mt-2 text-xs text-destructive">
              {props.terminal.webTerminalError}
            </p>
          ) : null}
          {props.terminal.webTerminalUrl ? (
            <a
              href={props.terminal.webTerminalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-bold underline decoration-2 underline-offset-4"
            >
              Open current web terminal link →
            </a>
          ) : null}
          {props.terminal.sshCommand ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                {props.terminal.sshExpiresAt
                  ? `Expires at ${formatDateTime(props.terminal.sshExpiresAt) ?? props.terminal.sshExpiresAt}`
                  : 'Temporary SSH access created.'}
              </p>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded border border-foreground/30 bg-muted p-2 text-[11px]">
                {props.terminal.sshCommand}
              </pre>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Generate an SSH command to open a terminal directly in this
              sandbox.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-md border-2 border-foreground bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              App Preview Logs
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                props.preview.setPreviewLogsRequestNonce((value) => value + 1)
              }
              disabled={props.preview.isPreviewLogsLoading}
              className="h-7 border-2 border-foreground px-2 text-[10px] font-black uppercase"
            >
              {props.preview.isPreviewLogsLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
          {props.preview.previewLogPath ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {props.preview.previewLogPath}
            </p>
          ) : null}
          {props.preview.previewLogsError ? (
            <p className="mt-2 text-xs text-destructive">
              {props.preview.previewLogsError}
            </p>
          ) : (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-foreground/30 bg-muted p-2 text-[11px]">
              {props.preview.previewLogs || 'No logs yet.'}
            </pre>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-card">
        {props.preview.appPreviewUrl ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2">
              <p className="truncate text-xs font-black uppercase tracking-widest">
                Port {props.preview.previewPort}
              </p>
              <a
                href={props.preview.appPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold underline decoration-2 underline-offset-4"
              >
                New tab →
              </a>
            </div>
            <iframe
              title={`${props.sandbox.repoName} app preview on port ${props.preview.previewPort}`}
              src={
                props.preview.appPreviewIframeUrl ?? props.preview.appPreviewUrl
              }
              onLoad={() => props.preview.setHasPreviewIframeLoaded(true)}
              className="h-full w-full bg-background"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              {derivePreviewMessage(
                props.paymentMethod,
                props.preview.previewPort,
                props.sandbox.previewUrl,
              )}
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function derivePreviewMessage(
  paymentMethod: SandboxPaymentMethod,
  previewPort: string,
  sandboxPreviewUrl?: string | null,
) {
  if (sandboxPreviewUrl?.includes('3000')) {
    if (isX402SandboxPaymentMethod(paymentMethod)) {
      return 'Choose a port, then use Pay and boot to load the app preview with x402 if needed.'
    }

    if (isValidPreviewPort(previewPort)) {
      return 'Choose a valid port to load your app preview.'
    }
  }

  return 'App preview URL is not ready yet. Restarting the sandbox will populate the preview pattern for this panel.'
}
