import type * as Party from 'partykit/server'
import type {
  AgentRegistry,
  AgentRecord,
  SessionState,
  TaskQueue,
  Task,
  OwnershipMap,
  OwnershipEntry,
  ContractRegistry,
  TokenMeters,
  TokenMeterEntry,
  ClientMessage,
  ServerMessage,
  ApiContract,
} from '@squad/types'
import { assembleContextInjection } from './context-injection.js'
import { checkHeartbeats } from './heartbeat.js'

// ─── Pure handler functions (exported for unit testing) ─────────────────────

export function handleOwnershipPost(
  ownership: OwnershipMap,
  body: { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
): { ok: boolean; updated: OwnershipMap } {
  const normalized = body.path.replace(/^\//, '')
  const entry: OwnershipEntry = {
    agentId: body.agentId,
    tier: body.tier,
    taskId: body.taskId,
  }
  return { ok: true, updated: { ...ownership, [normalized]: entry } }
}

export function handleOwnershipGet(
  ownership: OwnershipMap,
  path: string
): { owned: boolean; agentId: string | null; tier: string | null } {
  const normalized = path.replace(/^\//, '')
  const entry = ownership[normalized]
  if (!entry) return { owned: false, agentId: null, tier: null }
  return { owned: true, agentId: entry.agentId, tier: entry.tier }
}

export function handleOwnershipDelete(
  ownership: OwnershipMap,
  path: string
): { ok: boolean; updated: OwnershipMap } {
  const normalized = path.replace(/^\//, '')
  const updated = { ...ownership }
  delete updated[normalized]
  return { ok: true, updated }
}

export function handleTokenUpdate(
  meters: TokenMeters,
  body: { userId: string; tokensIn: number; tokensOut: number }
): { ok: boolean; runningTotal: { tokensIn: number; tokensOut: number } } {
  const existing: TokenMeterEntry = meters[body.userId] ?? {
    tokensIn: 0,
    tokensOut: 0,
    lastUpdated: new Date().toISOString(),
  }
  const runningTotal = {
    tokensIn: existing.tokensIn + body.tokensIn,
    tokensOut: existing.tokensOut + body.tokensOut,
  }
  return { ok: true, runningTotal }
}

export interface AppState {
  agents: AgentRegistry
  tasks: TaskQueue
  session: SessionState
}

export function applyClientMessage(state: AppState, msg: ClientMessage): AppState {
  const agents = { ...state.agents }
  const tasks = { ...state.tasks }
  const session = { ...state.session }

  switch (msg.type) {
    case 'register_agent': {
      agents[msg.agentId] = {
        agentId: msg.agentId,
        userId: msg.userId,
        displayName: msg.displayName,
        status: 'idle',
        currentTaskId: null,
        lastHeartbeat: Date.now(),
        tokensUsed: 0,
        role: msg.role ?? 'agent',
      }
      break
    }

    case 'heartbeat': {
      const agent = agents[msg.agentId]
      if (agent) {
        agents[msg.agentId] = { ...agent, lastHeartbeat: Date.now() }
      }
      break
    }

    case 'update_status': {
      const agent = agents[msg.agentId]
      if (agent) {
        agents[msg.agentId] = { ...agent, status: msg.status }
      }
      break
    }

    case 'task_claim': {
      const agent = agents[msg.agentId]
      const task = tasks[msg.taskId]
      if (agent) {
        agents[msg.agentId] = { ...agent, currentTaskId: msg.taskId, status: 'building' }
      }
      if (task) {
        tasks[msg.taskId] = {
          ...task,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        }
      }
      break
    }

    case 'task_done': {
      const agent = agents[msg.agentId]
      const task = tasks[msg.taskId]
      if (task) {
        tasks[msg.taskId] = {
          ...task,
          status: 'done',
          actualTokens: msg.tokensUsed,
          completedAt: new Date().toISOString(),
        }
      }
      if (agent) {
        agents[msg.agentId] = {
          ...agent,
          currentTaskId: null,
          status: 'idle',
          tokensUsed: agent.tokensUsed + msg.tokensUsed,
        }
      }
      break
    }

    case 'task_blocked': {
      const task = tasks[msg.taskId]
      if (task) {
        tasks[msg.taskId] = { ...task, status: 'blocked', blockedReason: msg.reason }
      }
      break
    }

    case 'update_spec': {
      session.agreedSpec = msg.spec
      break
    }

    case 'publish_contract': {
      session.apiContracts = {
        ...session.apiContracts,
        [`${msg.contract.method} ${msg.contract.path}`]: msg.contract,
      }
      break
    }

    case 'add_decision': {
      const entry = {
        summary: msg.summary,
        decidedBy: msg.decidedBy,
        timestamp: new Date().toISOString(),
      }
      const log = [...session.decisionLog, entry].slice(-20)
      session.decisionLog = log
      break
    }

    case 'update_tokens': {
      const agent = Object.values(agents).find((a) => a.userId === msg.userId)
      if (agent) {
        agents[agent.agentId] = {
          ...agent,
          tokensUsed: agent.tokensUsed + msg.tokensIn + msg.tokensOut,
        }
      }
      break
    }

    case 'dispatch_tasks': {
      for (const task of msg.tasks) {
        tasks[task.id] = task
      }
      break
    }

    case 'session_close': {
      session.status = 'done'
      break
    }

    case 'broadcast_agent_message': {
      // Stateless — handled at server level in onMessage
      break
    }

    case 'orchestrator_dispatch': {
      for (const task of msg.taskGraph) {
        tasks[task.id] = task
      }
      break
    }
  }

  return { agents, tasks, session }
}

export function handleConflictFeedback(
  currentRound: number,
  conflictAgents: string[],
  maxRounds: number
): { round: number; limitReached: boolean; conflictAgents: string[] } {
  const round = currentRound + 1
  return { round, limitReached: round >= maxRounds, conflictAgents }
}

export function handleMergeComplete(
  _currentRound: number
): { conflictRound: number } {
  return { conflictRound: 0 }
}

// ─── Partykit Server ─────────────────────────────────────────────────────────

export default class SSSServer implements Party.Server {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  constructor(readonly room: Party.Room) {}

  async onStart() {
    // Clear any stale interval from a previous wake cycle
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    const existing = await this.room.storage.get<SessionState>('session')
    if (!existing) {
      const session: SessionState = {
        id: this.room.id,
        hostUserId: '',
        projectBrief: '',
        agreedSpec: '',
        decisionLog: [],
        apiContracts: {},
        sharedTypesSnapshot: '',
        status: 'lobby',
        createdAt: new Date().toISOString(),
      }
      await this.room.storage.put('session', session)
      await this.room.storage.put('agents', {})
      await this.room.storage.put('tasks', {})
      await this.room.storage.put('ownership', {})
      await this.room.storage.put('contracts', {})
      await this.room.storage.put('meters', {})
    }

    this.heartbeatInterval = setInterval(() => void this.runHeartbeatCheck(), 60_000)
  }

  async onConnect(conn: Party.Connection) {
    const [session, agents, tasks, ownership] = await Promise.all([
      this.room.storage.get<SessionState>('session'),
      this.room.storage.get<AgentRegistry>('agents'),
      this.room.storage.get<TaskQueue>('tasks'),
      this.room.storage.get<OwnershipMap>('ownership'),
    ])

    conn.send(JSON.stringify({ type: 'session_state', payload: session! } satisfies ServerMessage))

    const agentRegistry = agents ?? {}
    for (const agent of Object.values(agentRegistry)) {
      conn.send(JSON.stringify({ type: 'agent_update', payload: agent } satisfies ServerMessage))
    }

    const taskQueue = tasks ?? {}
    for (const task of Object.values(taskQueue)) {
      conn.send(JSON.stringify({ type: 'task_update', payload: task } satisfies ServerMessage))
    }

    if (ownership && Object.keys(ownership).length > 0) {
      conn.send(JSON.stringify({ type: 'ownership_update', payload: ownership } satisfies ServerMessage))
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(message) as ClientMessage
    } catch {
      return
    }
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const session = (await this.room.storage.get<SessionState>('session'))!

    const next = applyClientMessage({ agents, tasks, session }, msg)

    await this.room.storage.put('agents', next.agents)
    await this.room.storage.put('tasks', next.tasks)
    await this.room.storage.put('session', next.session)

    if (msg.type === 'register_agent' || msg.type === 'update_status' || msg.type === 'heartbeat') {
      const agentId = msg.agentId
      const agentRecord = next.agents[agentId]
      if (agentRecord) {
        this.room.broadcast(JSON.stringify({ type: 'agent_update', payload: agentRecord } satisfies ServerMessage))
      }
    }
    if (msg.type === 'task_claim' || msg.type === 'task_done' || msg.type === 'task_blocked') {
      const taskId = msg.taskId
      const taskRecord = next.tasks[taskId]
      if (taskRecord) {
        this.room.broadcast(JSON.stringify({ type: 'task_update', payload: taskRecord } satisfies ServerMessage))
      }
      // Also emit agent_blocked when a task is blocked
      if (msg.type === 'task_blocked') {
        this.room.broadcast(JSON.stringify({
          type: 'agent_blocked',
          agentId: msg.agentId,
          taskId: msg.taskId,
          reason: msg.reason,
        } satisfies ServerMessage))
      }
    }
    if (msg.type === 'dispatch_tasks') {
      this.room.broadcast(JSON.stringify({ type: 'build_started', taskGraph: msg.tasks } satisfies ServerMessage))
    }
    if (msg.type === 'orchestrator_dispatch') {
      this.room.broadcast(JSON.stringify({ type: 'build_started', taskGraph: msg.taskGraph } satisfies ServerMessage))
    }
    if (msg.type === 'publish_contract') {
      this.room.broadcast(JSON.stringify({ type: 'contract_published', payload: msg.contract } satisfies ServerMessage))
    }
    if (msg.type === 'broadcast_agent_message') {
      this.room.broadcast(JSON.stringify({
        type: 'agent_message',
        agentId: msg.agentId,
        content: msg.content,
        mode: msg.mode,
      } satisfies ServerMessage))
    }
  }

  async onRequest(req: Party.Request): Promise<Response> {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    // /parties/main/{id}/ownership[/{encodedPath}]
    // /parties/main/{id}/context-injection/{agentId}
    // /parties/main/{id}/token-update

    const resource = segments[3]

    if (resource === 'ownership') {
      return this.handleOwnershipRequest(req, segments)
    }
    if (resource === 'context-injection') {
      return this.handleContextInjection(segments)
    }
    if (resource === 'token-update') {
      return this.handleTokenUpdateRequest(req)
    }
    if (resource === 'dispatch') {
      return this.handleDispatch(req)
    }
    if (resource === 'health') {
      return Response.json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  }

  private async handleOwnershipRequest(req: Party.Request, segments: string[]): Promise<Response> {
    const ownership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}
    const encodedPath = segments[4]

    if (req.method === 'GET' && encodedPath) {
      const path = decodeURIComponent(encodedPath)
      const result = handleOwnershipGet(ownership, path)
      return Response.json(result)
    }

    if (req.method === 'POST') {
      const body = await req.json() as { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
      const result = handleOwnershipPost(ownership, body)
      await this.room.storage.put('ownership', result.updated)
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: result.updated } satisfies ServerMessage))
      return Response.json({ ok: result.ok })
    }

    if (req.method === 'DELETE' && encodedPath) {
      const path = decodeURIComponent(encodedPath)
      const result = handleOwnershipDelete(ownership, path)
      await this.room.storage.put('ownership', result.updated)
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: result.updated } satisfies ServerMessage))
      return Response.json({ ok: result.ok })
    }

    return new Response('Bad request', { status: 400 })
  }

  private async handleContextInjection(segments: string[]): Promise<Response> {
    const agentId = segments[4]
    if (!agentId) return new Response('Missing agentId', { status: 400 })

    const session = await this.room.storage.get<SessionState>('session')
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const contracts = (await this.room.storage.get<ContractRegistry>('contracts')) ?? {}

    if (!session) return new Response('Session not initialized', { status: 500 })

    try {
      const result = assembleContextInjection({ agentId, session, agents, tasks, contracts })
      return Response.json(result)
    } catch (err) {
      return new Response((err as Error).message, { status: 404 })
    }
  }

  private async handleDispatch(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    let body: {
      tasks: Task[]
      ownerships: Array<{ path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }>
    }
    try {
      body = await req.json() as typeof body
    } catch {
      return Response.json({ error: 'invalid body' }, { status: 400 })
    }

    // Store tasks
    const existingTasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const updatedTasks = { ...existingTasks }
    for (const task of body.tasks) {
      updatedTasks[task.id] = task
    }
    await this.room.storage.put('tasks', updatedTasks)

    // Store ownerships
    const existingOwnership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}
    let updatedOwnership = { ...existingOwnership }
    for (const o of body.ownerships) {
      const result = handleOwnershipPost(updatedOwnership, o)
      updatedOwnership = result.updated
    }
    await this.room.storage.put('ownership', updatedOwnership)

    // Update session status (never downgrade from 'done')
    const session = await this.room.storage.get<SessionState>('session')
    if (!session) return new Response('Session not initialized', { status: 500 })

    if (session.status !== 'done') {
      const updatedSession = { ...session, status: 'building' as const }
      await this.room.storage.put('session', updatedSession)
      this.room.broadcast(JSON.stringify({
        type: 'session_state',
        payload: updatedSession,
      } satisfies ServerMessage))
    }

    // Broadcast build_started + ownership update
    this.room.broadcast(JSON.stringify({
      type: 'build_started',
      taskGraph: body.tasks,
    } satisfies ServerMessage))
    this.room.broadcast(JSON.stringify({
      type: 'ownership_update',
      payload: updatedOwnership,
    } satisfies ServerMessage))

    return Response.json({ ok: true })
  }

  private async handleTokenUpdateRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = await req.json() as { userId: string; tokensIn: number; tokensOut: number }
    const meters = (await this.room.storage.get<TokenMeters>('meters')) ?? {}
    const result = handleTokenUpdate(meters, body)
    const updated: TokenMeters = {
      ...meters,
      [body.userId]: {
        tokensIn: result.runningTotal.tokensIn,
        tokensOut: result.runningTotal.tokensOut,
        lastUpdated: new Date().toISOString(),
      },
    }
    await this.room.storage.put('meters', updated)
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const agent = Object.values(agents).find((a) => a.userId === body.userId)
    if (agent) {
      const updatedAgents = {
        ...agents,
        [agent.agentId]: {
          ...agent,
          tokensUsed: agent.tokensUsed + body.tokensIn + body.tokensOut,
        },
      }
      await this.room.storage.put('agents', updatedAgents)
      this.room.broadcast(JSON.stringify({
        type: 'agent_update',
        payload: updatedAgents[agent.agentId]!,
      } satisfies ServerMessage))
    }
    return Response.json({ ok: result.ok, runningTotal: result.runningTotal })
  }

  private async runHeartbeatCheck(): Promise<void> {
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const ownership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })
    if (result.offlineAgentIds.length === 0) return

    await this.room.storage.put('agents', result.updatedAgents)
    await this.room.storage.put('tasks', result.updatedTasks)

    const updatedOwnership = { ...ownership }
    for (const path of result.releasedOwnershipPaths) {
      delete updatedOwnership[path]
    }
    await this.room.storage.put('ownership', updatedOwnership)

    for (const agentId of result.offlineAgentIds) {
      this.room.broadcast(JSON.stringify({ type: 'heartbeat_lost', agentId } satisfies ServerMessage))
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: updatedOwnership } satisfies ServerMessage))
    }

    // Broadcast each released task so agents can detect and reclaim orphans
    for (const taskId of result.releasedTaskIds) {
      const task = result.updatedTasks[taskId]
      if (task) {
        this.room.broadcast(JSON.stringify({ type: 'task_update', payload: task } satisfies ServerMessage))
      }
    }
  }
}

SSSServer satisfies Party.Worker
