import { Octokit } from '@octokit/rest'

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token })
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}
