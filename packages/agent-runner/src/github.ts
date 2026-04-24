import { Octokit } from '@octokit/rest'
import { execSync } from 'node:child_process'

export interface GitHubClientOptions {
  token: string
  owner: string
  repo: string
  workdir: string
}

export function createGitHubClient(opts: GitHubClientOptions) {
  const octokit = new Octokit({ auth: opts.token })

  async function createBranch(branchName: string, base: string): Promise<void> {
    const { data: ref } = await octokit.git.getRef({
      owner: opts.owner,
      repo: opts.repo,
      ref: `heads/${base}`,
    })
    await octokit.git.createRef({
      owner: opts.owner,
      repo: opts.repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    }).catch((err: { status?: number }) => {
      if (err.status !== 422) throw err  // 422 = already exists, safe to ignore
    })
  }

  function pushBranch(branchName: string): void {
    execSync(`git push origin ${branchName}`, { cwd: opts.workdir, stdio: 'pipe' })
  }

  async function createPR(title: string, head: string, base: string, body: string): Promise<string> {
    const { data } = await octokit.pulls.create({
      owner: opts.owner,
      repo: opts.repo,
      title,
      head,
      base,
      body,
    })
    return data.html_url
  }

  return { createBranch, pushBranch, createPR }
}

export type GitHubClient = ReturnType<typeof createGitHubClient>
