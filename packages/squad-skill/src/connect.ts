import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from '@squad/agent-runner'
import type { Task } from '@squad/types'
import { formatError } from './errors.js'
import { runGuidedMode, printNonInteractiveHint } from './prompt.js'

interface ConnectOptions {
  sessionId: string
  agentId: string
  apiKey: string
  partyUrl: string
  workdir?: string
  githubToken?: string
}

type IncomingMessage =
  | { type: 'task_update'; payload: Task }
  | { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: string }

export async function connectToSession(opts: ConnectOptions): Promise<void> {
  const { sessionId, agentId, apiKey, partyUrl, workdir = process.cwd(), githubToken } = opts
  const anthropic = new Anthropic({ apiKey })

  const partyHost = partyUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '')
  const wsUrl = `${partyUrl}/parties/main/${sessionId}`
  console.log(`Connecting to ${wsUrl} as ${agentId}…`)

  const ws = new WebSocket(wsUrl)

  // Shared task state — updated from incoming task_update messages
  const taskStatus = new Map<string, Task['status']>()
  const taskDoneListeners = new Map<string, Array<() => void>>()
  const activeTaskIds = new Set<string>()

  function onTaskUpdate(task: Task): void {
    taskStatus.set(task.id, task.status)
    if (task.status === 'done' || task.status === 'aborted') {
      const listeners = taskDoneListeners.get(task.id) ?? []
      for (const cb of listeners) cb()
      taskDoneListeners.delete(task.id)
    }
  }

  function waitForDependencies(depIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const pending = new Set(depIds.filter(id => taskStatus.get(id) !== 'done' && taskStatus.get(id) !== 'aborted'))
      if (pending.size === 0) { resolve(); return }
      for (const id of [...pending]) {
        const listeners = taskDoneListeners.get(id) ?? []
        listeners.push(() => {
          pending.delete(id)
          if (pending.size === 0) resolve()
        })
        taskDoneListeners.set(id, listeners)
      }
    })
  }

  async function runTaskWhenReady(task: Task): Promise<void> {
    if (activeTaskIds.has(task.id)) return
    activeTaskIds.add(task.id)
    try {
      if (task.dependsOn.length > 0) {
        await waitForDependencies(task.dependsOn)
      }
      const anyAborted = task.dependsOn.some(id => taskStatus.get(id) === 'aborted')
      if (anyAborted) {
        console.log(`[${agentId}] Skipping ${task.title} — dependency aborted`)
        ws.send(JSON.stringify({
          type: 'task_blocked',
          agentId,
          taskId: task.id,
          reason: 'dependency task was aborted',
        }))
        return
      }
      console.log(`[${agentId}] Starting: ${task.title}`)
      await runAgent({
        agentId,
        userId: agentId,
        sessionId,
        task,
        partyHost,
        anthropicApiKey: apiKey,
        githubToken,
        workdir,
      })
      console.log(`[${agentId}] Done: ${task.title}`)
    } catch (err) {
      console.error(`[${agentId}] Task failed: ${task.title}`, err)
    } finally {
      activeTaskIds.delete(task.id)
    }
  }

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'register_agent',
      agentId,
      userId: agentId,
      displayName: `Claude (local)`,
    }))
    console.log(`Connected. Listening for messages as ${agentId}`)
  })

  ws.on('message', async (raw) => {
    let msg: IncomingMessage
    try {
      msg = JSON.parse(raw.toString()) as IncomingMessage
    } catch {
      return
    }

    if (msg.type === 'task_update') {
      const taskMsg = msg as { type: 'task_update'; payload: Task }
      onTaskUpdate(taskMsg.payload)
      // Orphan reclaim: if SSS reset one of our tasks to pending, pick it back up
      const t = taskMsg.payload
      if (t.status === 'pending' && t.assignedAgentId === agentId && !activeTaskIds.has(t.id)) {
        console.log(`[${agentId}] Reclaiming orphaned task: ${t.title}`)
        void runTaskWhenReady(t)
      }
      return
    }

    if (msg.type === 'agent_not_found') {
      const m = msg as { type: string; available?: string[] }
      console.error(formatError('agent_not_found', { agentId, available: m.available ?? [] }))
      process.exit(1)
    }

    if (msg.type === 'build_started') {
      const buildMsg = msg as { type: 'build_started'; taskGraph: Task[] }
      // Seed task state from the full graph so dependency gates work across agents
      for (const task of buildMsg.taskGraph) {
        taskStatus.set(task.id, task.status)
      }
      const myTasks = buildMsg.taskGraph.filter((t: Task) => t.assignedAgentId === agentId)
      if (myTasks.length === 0) {
        console.log(`[${agentId}] build_started — no tasks assigned to me`)
        return
      }
      console.log(`[${agentId}] build_started — ${myTasks.length} task(s) assigned, running in parallel`)
      // Fire-and-forget: do NOT await here so the message handler stays responsive
      // to incoming task_update messages that dependency gates need to see
      for (const task of myTasks) {
        void runTaskWhenReady(task)
      }
      return
    }

    if (msg.type !== 'route_to_agent') return
    const routeMsg = msg as { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
    if (routeMsg.agentId !== agentId) return

    console.log(`[${agentId}] received ${routeMsg.mode} request: "${routeMsg.content.slice(0, 60)}…"`)

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: routeMsg.mode === 'status' ? 300 : 600,
        system: `You are ${agentId}, a collaborative AI agent in a Squad coding session. Be concise.`,
        messages: [{ role: 'user', content: routeMsg.content }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      ws.send(JSON.stringify({
        type: 'agent_response',
        agentId,
        content: text,
        mode: routeMsg.mode,
        requestId: routeMsg.requestId,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      if (errMsg.includes('401') || errMsg.toLowerCase().includes('unauthorized')) {
        console.error(formatError('bad_api_key', {}))
        process.exit(1)
      }
      ws.send(JSON.stringify({
        type: 'agent_error',
        agentId,
        error: errMsg,
        requestId: routeMsg.requestId,
      }))
    }
  })

  ws.on('close', () => {
    console.log('Disconnected from session')
    process.exit(0)
  })

  ws.on('error', (err) => {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.error(formatError('ws_refused', { host: partyHost }))
    } else {
      console.error('WebSocket error:', err.message)
    }
    process.exit(1)
  })

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nDisconnecting…')
      ws.close()
      resolve()
    })
  })
}

export async function maybeRunGuidedMode(args: {
  session?: string
  agent?: string
  key?: string
  partyUrl: string
  workdir?: string
  githubToken?: string
}): Promise<void> {
  let { session, agent, key } = args

  if (!session || !agent || !key) {
    const guided = await runGuidedMode()
    session = guided.sessionId
    agent = guided.agentId
    key = guided.apiKey

    console.log(`\nConnecting to session ${session} as ${agent}…`)
    console.log('✓ Starting connection\n')

    printNonInteractiveHint(session, agent, key)
  }

  await connectToSession({
    sessionId: session,
    agentId: agent,
    apiKey: key,
    partyUrl: args.partyUrl,
    workdir: args.workdir,
    githubToken: args.githubToken,
  })
}
