import { Daytona } from '@daytonaio/sdk'
import type { Sandbox } from '@daytonaio/sdk'
import { getWorkspacePath, normalizeSandboxInput } from '~/lib/sandboxes'

const OPENCODE_PORT = 3000
const OPENCODE_VERSION = '1.1.1'
const READY_TIMEOUT_MS = 15000
const DEFAULT_DAYTONA_API_URL = 'https://app.daytona.io/api'

function injectEnvVar(name: string, content: string) {
  const base64 = Buffer.from(content).toString('base64')
  return `${name}=$(echo '${base64}' | base64 -d)`
}

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getRequiredDaytonaApiKey() {
  const apiKey = process.env.DAYTONA_API_KEY

  if (!apiKey) {
    throw new Error('DAYTONA_API_KEY is not configured on the server.')
  }

  return apiKey
}

function getDaytonaApiUrl() {
  const configuredApiUrl = process.env.DAYTONA_API_URL?.trim()

  if (!configuredApiUrl) {
    return DEFAULT_DAYTONA_API_URL
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(configuredApiUrl)
  } catch {
    throw new Error(
      `DAYTONA_API_URL is invalid. Expected a full URL like ${DEFAULT_DAYTONA_API_URL}.`,
    )
  }

  if (parsedUrl.hostname === 'api.daytona.ai') {
    return DEFAULT_DAYTONA_API_URL
  }

  return configuredApiUrl
}

async function cloneRepository(args: {
  sandbox: Sandbox
  repoUrl: string
  branch?: string
  githubToken?: string | null
}) {
  const normalized = normalizeSandboxInput({
    repoUrl: args.repoUrl,
    branch: args.branch,
  })
  const workspacePath = getWorkspacePath(normalized.repoName)

  try {
    if (normalized.repoProvider === 'github' && args.githubToken) {
      await args.sandbox.git.clone(
        normalized.repoUrl,
        workspacePath,
        normalized.branch,
        undefined,
        'git',
        args.githubToken,
      )
    } else {
      await args.sandbox.git.clone(
        normalized.repoUrl,
        workspacePath,
        normalized.branch,
      )
    }
  } catch (error) {
    if (normalized.repoProvider === 'github' && !args.githubToken) {
      throw new Error(
        'Cloning the repository failed. If it is private, connect GitHub in Clerk and grant repo access before retrying.',
      )
    }

    throw error
  }

  return {
    ...normalized,
    workspacePath,
  }
}

async function startOpencodeWeb(
  sandbox: Sandbox,
  workspacePath: string,
): Promise<string> {
  const previewLink = await sandbox.getPreviewLink(OPENCODE_PORT)
  const previewUrlPattern = (await sandbox.getPreviewLink(1234)).url.replace(
    /1234/,
    '{PORT}',
  )
  const opencodeConfig = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'daytona',
    agent: {
      daytona: {
        description: 'Daytona sandbox-aware coding agent',
        mode: 'primary',
        prompt: [
          'You are running in a Daytona sandbox.',
          'Use the /home/daytona directory instead of /workspace for file operations.',
          `When running services on localhost, they will be accessible as: ${previewUrlPattern}`,
          'When starting a server, always give the user the preview URL to access it.',
          'When starting a server, start it in the background with & so the command does not block further instructions.',
        ].join(' '),
      },
    },
  })
  const sessionId = `opencode-web-${Date.now()}`
  const envVar = injectEnvVar('OPENCODE_CONFIG_CONTENT', opencodeConfig)

  await sandbox.process.createSession(sessionId)
  const command = await sandbox.process.executeSessionCommand(sessionId, {
    command: `cd ${quoteShellArg(workspacePath)} && ${envVar} opencode web --port ${OPENCODE_PORT}`,
    runAsync: true,
  })

  if (!command.cmdId) {
    throw new Error('Failed to start OpenCode inside the sandbox.')
  }

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }

    void sandbox.process.getSessionCommandLogs(
      sessionId,
      command.cmdId,
      (stdout) => {
        if (
          stdout.includes(`127.0.0.1:${OPENCODE_PORT}`) ||
          stdout.includes('Web interface:')
        ) {
          finish()
        }
      },
      () => {},
    )

    setTimeout(finish, READY_TIMEOUT_MS)
  })

  return previewLink.url
}

export async function createOpenCodeSandbox(args: {
  repoUrl: string
  branch?: string
  githubToken?: string | null
}) {
  const daytona = new Daytona({
    apiKey: getRequiredDaytonaApiKey(),
    apiUrl: getDaytonaApiUrl(),
  })
  let sandbox: Sandbox | undefined

  try {
    sandbox = await daytona.create({
      public: true,
      autoStopInterval: 30,
    })

    const repo = await cloneRepository({
      sandbox,
      repoUrl: args.repoUrl,
      branch: args.branch,
      githubToken: args.githubToken,
    })

    await sandbox.process.executeCommand(
      `npm i -g opencode-ai@${OPENCODE_VERSION}`,
      undefined,
      undefined,
      300,
    )

    const previewUrl = await startOpencodeWeb(sandbox, repo.workspacePath)

    return {
      repoName: repo.repoName,
      repoProvider: repo.repoProvider,
      branch: repo.branch,
      workspacePath: repo.workspacePath,
      previewUrl,
      daytonaSandboxId: sandbox.id,
    }
  } catch (error) {
    if (sandbox) {
      try {
        await sandbox.delete()
      } catch {
        // Best effort cleanup for failed launches.
      }
    }

    throw error
  }
}

export async function deleteOpenCodeSandbox(daytonaSandboxId: string) {
  const daytona = new Daytona({
    apiKey: getRequiredDaytonaApiKey(),
    apiUrl: getDaytonaApiUrl(),
  })
  const sandbox = await daytona.get(daytonaSandboxId)
  await sandbox.delete()
}
