import { posix as pathPosix } from 'node:path'
import { Daytona } from '@daytonaio/sdk'
import type { Sandbox } from '@daytonaio/sdk'
import type {
  OpenCodeAgentPreset,
  OpenCodeAgentPresetId,
  OpenCodeSkillPermission,
} from '~/lib/opencode/presets'
import { getOpenCodeAgentPreset } from '~/lib/opencode/presets'
import { getWorkspacePath, normalizeSandboxInput } from '~/lib/sandboxes'

const OPENCODE_PORT = 3000
const OPENCODE_VERSION = '1.2.26'
const READY_TIMEOUT_MS = 15000
const DEFAULT_DAYTONA_API_URL = 'https://app.daytona.io/api'

type LaunchEnvironment = Record<string, string>

type ExecuteCommandResponse = {
  artifacts?: {
    stdout?: string
  }
  result?: string
  stdout?: string
  output?: string
}

function injectEnvVar(name: string, content: string) {
  const base64 = Buffer.from(content).toString('base64')
  return `${name}=$(echo '${base64}' | base64 -d)`
}

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getRequiredDaytonaApiKey() {
  return getRequiredServerEnv('DAYTONA_API_KEY')
}

function getRequiredServerEnv(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is not configured on the server.`)
  }

  return value
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

function getCommandStdout(response: ExecuteCommandResponse) {
  return (
    response.artifacts?.stdout ??
    response.stdout ??
    response.result ??
    response.output ??
    ''
  )
}

function buildSkillPermissions(
  preset: OpenCodeAgentPreset,
): Record<string, OpenCodeSkillPermission> {
  const permissions: Record<string, OpenCodeSkillPermission> = {
    '*': 'deny',
  }

  for (const skill of preset.skills) {
    permissions[skill.id] = skill.permission ?? 'allow'
  }

  return permissions
}

function buildOpenCodeConfig(
  preset: OpenCodeAgentPreset,
  previewUrlPattern: string,
) {
  const skillPermissions = buildSkillPermissions(preset)
  const modelId = `${preset.provider}/${preset.model}`

  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    model: modelId,
    default_agent: preset.id,
    instructions: ['.buddypie/opencode/AGENTS.md'],
    permission: {
      skill: skillPermissions,
    },
    agent: {
      [preset.id]: {
        description: preset.description,
        mode: 'primary',
        model: modelId,
        prompt: [
          'You are running in a Daytona sandbox.',
          'Use the /home/daytona directory instead of /workspace for file operations.',
          `When running services on localhost, they will be accessible as: ${previewUrlPattern}`,
          'When starting a server, always give the user the preview URL to access it.',
          'When starting a server, start it in the background with & so the command does not block further instructions.',
          preset.agentPrompt,
        ].join(' '),
        permission: {
          skill: skillPermissions,
        },
      },
    },
    ...(Object.keys(preset.mcp).length > 0 ? { mcp: preset.mcp } : {}),
  })
}

function buildLaunchEnvironment(
  preset: OpenCodeAgentPreset,
  githubToken?: string | null,
): LaunchEnvironment {
  const environment: LaunchEnvironment = {}

  for (const envName of preset.requiredEnv) {
    environment[envName] = getRequiredServerEnv(envName)
  }

  for (const mcp of Object.values(preset.mcp)) {
    for (const envName of mcp.env ?? []) {
      const value = process.env[envName]?.trim()

      if (value) {
        environment[envName] = value
      }
    }
  }

  if (githubToken) {
    environment.GITHUB_TOKEN = githubToken
  }

  return environment
}

async function ensureRemoteDirectory(sandbox: Sandbox, remotePath: string) {
  await sandbox.process.executeCommand(
    `mkdir -p ${quoteShellArg(remotePath)}`,
    undefined,
    undefined,
    30,
  )
}

async function uploadTextFile(
  sandbox: Sandbox,
  remotePath: string,
  content: string,
) {
  await ensureRemoteDirectory(sandbox, pathPosix.dirname(remotePath))
  await sandbox.fs.uploadFile(Buffer.from(content, 'utf8'), remotePath)
}

async function hideManagedFilesFromGitStatus(
  sandbox: Sandbox,
  workspacePath: string,
  preset: OpenCodeAgentPreset,
) {
  const excludePath = pathPosix.join(workspacePath, '.git/info/exclude')
  const patterns = [
    '.buddypie/',
    ...preset.skills.map((skill) => `.opencode/skills/${skill.id}/`),
  ]
  const script = [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const target = process.argv[1]",
    "const patterns = JSON.parse(process.env.BUDDYPIE_EXCLUDES ?? '[]')",
    "let existing = ''",
    "try { existing = fs.readFileSync(target, 'utf8') } catch {}",
    "const lines = new Set(existing.split(/\\r?\\n/).filter(Boolean))",
    'for (const pattern of patterns) lines.add(pattern)',
    'fs.mkdirSync(path.dirname(target), { recursive: true })',
    "fs.writeFileSync(target, `${Array.from(lines).join('\\n')}\\n`, 'utf8')",
  ].join('; ')

  await sandbox.process.executeCommand(
    `node -e ${quoteShellArg(script)} ${quoteShellArg(excludePath)}`,
    undefined,
    {
      BUDDYPIE_EXCLUDES: JSON.stringify(patterns),
    },
    30,
  )
}

async function writeManagedWorkspaceFiles(
  sandbox: Sandbox,
  workspacePath: string,
  preset: OpenCodeAgentPreset,
) {
  const instructionsPath = pathPosix.join(workspacePath, '.buddypie/opencode/AGENTS.md')
  await uploadTextFile(sandbox, instructionsPath, preset.instructionsMd)

  for (const skill of preset.skills) {
    const skillPath = pathPosix.join(
      workspacePath,
      '.opencode/skills',
      skill.id,
      'SKILL.md',
    )

    await uploadTextFile(sandbox, skillPath, skill.content)
  }

  await hideManagedFilesFromGitStatus(sandbox, workspacePath, preset)
}

async function cloneRepository(args: {
  sandbox: Sandbox
  repoUrl: string
  branch?: string
  agentPresetId: OpenCodeAgentPresetId
  initialPrompt?: string
  githubToken?: string | null
}) {
  const normalized = normalizeSandboxInput({
    repoUrl: args.repoUrl,
    branch: args.branch,
    agentPresetId: args.agentPresetId,
    initialPrompt: args.initialPrompt,
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

async function startOpencodeWeb(args: {
  sandbox: Sandbox
  workspacePath: string
  preset: OpenCodeAgentPreset
  launchEnvironment: LaunchEnvironment
}): Promise<string> {
  const previewLink = await args.sandbox.getPreviewLink(OPENCODE_PORT)
  const previewUrlPattern = (await args.sandbox.getPreviewLink(1234)).url.replace(
    /1234/,
    '{PORT}',
  )
  const opencodeConfig = buildOpenCodeConfig(args.preset, previewUrlPattern)
  const sessionId = `opencode-web-${Date.now()}`
  const envVars = [
    injectEnvVar('OPENCODE_CONFIG_CONTENT', opencodeConfig),
    injectEnvVar('OPENCODE_DISABLE_CLAUDE_CODE', '1'),
    ...Object.entries(args.launchEnvironment).map(([name, value]) =>
      injectEnvVar(name, value),
    ),
  ].join(' ')

  await args.sandbox.process.createSession(sessionId)
  const command = await args.sandbox.process.executeSessionCommand(sessionId, {
    command: `cd ${quoteShellArg(args.workspacePath)} && ${envVars} opencode web --port ${OPENCODE_PORT}`,
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

    void args.sandbox.process.getSessionCommandLogs(
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

async function seedInitialPrompt(args: {
  sandbox: Sandbox
  workspacePath: string
  repoName: string
  preset: OpenCodeAgentPreset
  initialPrompt: string
}) {
  const seedScript = `
;(async () => {
  const baseUrl = 'http://127.0.0.1:${OPENCODE_PORT}'
  const sessionResponse = await fetch(\`\${baseUrl}/session\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: process.env.BUDDYPIE_SESSION_TITLE }),
  })
  if (!sessionResponse.ok) {
    throw new Error(\`OpenCode session creation failed: \${sessionResponse.status} \${await sessionResponse.text()}\`)
  }
  const session = await sessionResponse.json()
  const promptResponse = await fetch(\`\${baseUrl}/session/\${session.id}/prompt_async\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: process.env.BUDDYPIE_AGENT_ID,
      parts: [{ type: 'text', content: process.env.BUDDYPIE_INITIAL_PROMPT }],
    }),
  })
  if (!promptResponse.ok && promptResponse.status !== 204) {
    throw new Error(\`OpenCode prompt injection failed: \${promptResponse.status} \${await promptResponse.text()}\`)
  }
  process.stdout.write(JSON.stringify({ sessionId: session.id }))
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
`.trim()
  const response = (await args.sandbox.process.executeCommand(
    `node -e ${quoteShellArg(seedScript)}`,
    args.workspacePath,
    {
      BUDDYPIE_AGENT_ID: args.preset.id,
      BUDDYPIE_INITIAL_PROMPT: args.initialPrompt,
      BUDDYPIE_SESSION_TITLE: `${args.repoName} - ${args.preset.label}`,
    },
    60,
  )) as ExecuteCommandResponse
  const stdout = getCommandStdout(response).trim()

  if (!stdout) {
    throw new Error('OpenCode did not return a seeded session id.')
  }

  const payload = JSON.parse(stdout) as {
    sessionId?: string
  }

  if (!payload.sessionId) {
    throw new Error('OpenCode did not create a valid seeded session.')
  }

  return payload.sessionId
}

export async function createOpenCodeSandbox(args: {
  repoUrl: string
  branch?: string
  agentPresetId: string
  initialPrompt?: string
  githubToken?: string | null
}) {
  const daytona = new Daytona({
    apiKey: getRequiredDaytonaApiKey(),
    apiUrl: getDaytonaApiUrl(),
  })
  const preset = getOpenCodeAgentPreset(args.agentPresetId)
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
      agentPresetId: preset.id,
      initialPrompt: args.initialPrompt,
      githubToken: args.githubToken,
    })
    const launchEnvironment = buildLaunchEnvironment(preset, args.githubToken)

    await writeManagedWorkspaceFiles(sandbox, repo.workspacePath, preset)
    await sandbox.process.executeCommand(
      `npm i -g opencode-ai@${OPENCODE_VERSION}`,
      undefined,
      undefined,
      300,
    )

    const previewUrl = await startOpencodeWeb({
      sandbox,
      workspacePath: repo.workspacePath,
      preset,
      launchEnvironment,
    })
    const opencodeSessionId = await seedInitialPrompt({
      sandbox,
      workspacePath: repo.workspacePath,
      repoName: repo.repoName,
      preset,
      initialPrompt: repo.initialPrompt,
    })

    return {
      repoName: repo.repoName,
      repoProvider: repo.repoProvider,
      branch: repo.branch,
      workspacePath: repo.workspacePath,
      previewUrl,
      daytonaSandboxId: sandbox.id,
      opencodeSessionId,
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
