# Git strategy

## Branch model

```
main
  └── squad-merge          ← orchestrator creates this at merge time
        ├── agent-claude-1  ← orchestrator's work
        ├── agent-claude-2  ← agent 2's work
        ├── agent-claude-3  ← agent 3's work
        └── agent-claude-N  ← agent N's work
```

Each agent works exclusively on its own branch. Branches are created by the orchestrator at build dispatch time via GitHub API. Agents never interact with branches other than their own.

## GitHub repo setup

The squad session needs a GitHub repo. Two options:
1. **Host provides existing repo**: entered during session setup. Squad creates branches in it.
2. **Squad creates repo**: orchestrator creates a new repo under the host's GitHub account via OAuth.

The repo URL is stored in `sessions.github_repo_url`.

## Per-agent branch operations

Agents interact with Git via `Bash` tool calls inside their sandbox. They only run:
- `git add`
- `git commit`
- `git push origin agent-{agentId}`

They never run merge, rebase, checkout to other branches, or force push. The bash safety hook blocks these.

Agents commit frequently — after each meaningful file change — so progress is visible in GitHub and recovery is possible if a sandbox crashes.

Commit message format: `[{agentId}] {task_title}: {brief_description}`

Example: `[claude-2] Frontend nav: Add mobile responsive sidebar`

## Merge conflict probability

With correct file ownership enforcement, merge conflicts should be zero. Each agent owns non-overlapping file paths. The only shared files (SHARED-RO) are written exclusively by the orchestrator. However, the merge sequence always checks for conflicts and surfaces them in the group chat if they occur (see ORCHESTRATOR.md).
