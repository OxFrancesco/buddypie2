import type { OpenCodeAgentPresetId } from '~/lib/opencode/presets'
import {
  getOpenCodeAgentPreset,
  resolveOpenCodeModelOption,
} from '~/lib/opencode/presets'

const MAX_INITIAL_PROMPT_LENGTH = 10_000

export type SandboxPaymentMethod = 'credits' | 'x402' | 'delegated_budget'

export function isX402SandboxPaymentMethod(
  paymentMethod: SandboxPaymentMethod,
) {
  return paymentMethod === 'x402'
}

export function isDelegatedBudgetSandboxPaymentMethod(
  paymentMethod: SandboxPaymentMethod,
) {
  return paymentMethod === 'delegated_budget'
}

export function isWalletManagedSandboxPaymentMethod(
  paymentMethod: SandboxPaymentMethod,
) {
  return paymentMethod !== 'x402'
}

export type CreateSandboxInput = {
  repoUrl: string
  branch?: string
  agentPresetId: OpenCodeAgentPresetId
  agentProvider?: string
  agentModel?: string
  initialPrompt?: string
  paymentMethod?: SandboxPaymentMethod
}

export function normalizeSandboxInput(input: CreateSandboxInput) {
  const repoUrl = input.repoUrl.trim()
  const branch = input.branch?.trim() || undefined
  const preset = getOpenCodeAgentPreset(input.agentPresetId)
  const modelOption = resolveOpenCodeModelOption({
    provider: input.agentProvider,
    model: input.agentModel,
    fallbackProvider: preset.provider,
    fallbackModel: preset.model,
  })
  const initialPrompt = input.initialPrompt?.trim() || preset.starterPrompt

  if (!repoUrl) {
    throw new Error('A repository URL is required.')
  }

  if (initialPrompt.length > MAX_INITIAL_PROMPT_LENGTH) {
    throw new Error(
      `The kickoff prompt is too long. Keep it under ${MAX_INITIAL_PROMPT_LENGTH.toLocaleString()} characters.`,
    )
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(repoUrl)
  } catch {
    throw new Error('Use a valid HTTPS Git repository URL.')
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP(S) repository URLs are supported in this MVP.')
  }

  const repoName = parsedUrl.pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/, '')
    .trim()

  if (!repoName) {
    throw new Error('Could not determine the repository name from that URL.')
  }

  return {
    repoUrl: parsedUrl.toString(),
    branch,
    repoName,
    repoProvider: isGitHubRepo(parsedUrl)
      ? ('github' as const)
      : ('git' as const),
    agentPresetId: preset.id,
    agentLabel: preset.label,
    agentProvider: modelOption.provider,
    agentModel: modelOption.model,
    initialPrompt,
  }
}

export function isGitHubRepo(repoUrl: string | URL) {
  const parsedUrl = typeof repoUrl === 'string' ? new URL(repoUrl) : repoUrl
  return (
    parsedUrl.hostname === 'github.com' ||
    parsedUrl.hostname === 'www.github.com'
  )
}

export function getWorkspacePath(repoName: string) {
  const safeRepoName = repoName.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `/home/daytona/${safeRepoName}`
}
