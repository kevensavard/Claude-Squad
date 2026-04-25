import type { Octokit } from '@octokit/rest'

export interface MergeResult {
  prUrl: string
  squadBranch: string
  mergedAgents: string[]
  conflictAgents: string[]
  skippedAgents: string[]
}

export async function runMergeSequence({
  octokit,
  owner,
  repo,
  sessionId,
  agentIds,
  baseBranch = 'main',
}: {
  octokit: Octokit
  owner: string
  repo: string
  sessionId: string
  agentIds: string[]
  baseBranch?: string
}): Promise<MergeResult> {
  const squadBranch = `squad/${sessionId.slice(0, 8)}`

  const { data: baseRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  })

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${squadBranch}`,
    sha: baseRef.object.sha,
  }).catch((err: { status?: number }) => {
    if (err.status !== 422) throw err
  })

  const mergedAgents: string[] = []
  const conflictAgents: string[] = []
  const skippedAgents: string[] = []

  for (const agentId of agentIds) {
    const agentBranch = `agent-${agentId}`
    try {
      await octokit.repos.merge({
        owner,
        repo,
        base: squadBranch,
        head: agentBranch,
        commit_message: `Merge agent ${agentId} work`,
      })
      mergedAgents.push(agentId)
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 409) {
        conflictAgents.push(agentId)
      } else if (status === 404 || status === 422) {
        skippedAgents.push(agentId)
      } else {
        throw err
      }
    }
  }

  const conflictNote = conflictAgents.length > 0
    ? `\n\n> ⚠️ **Merge conflicts** in agents: ${conflictAgents.join(', ')} — manual resolution required.`
    : ''

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `Squad session ${sessionId.slice(0, 8)} — ${mergedAgents.length} agent(s) merged`,
    head: squadBranch,
    base: baseBranch,
    body: `## Squad Build\n\nMerged agents: ${mergedAgents.join(', ') || 'none'}${conflictNote}`,
  })

  return { prUrl: pr.html_url, squadBranch, mergedAgents, conflictAgents, skippedAgents }
}
