# Agent Issues Mermaid Workspace

Use this folder for AI-agent-authored Mermaid diagrams that explain a specific issue.

## Workflow

1. Create or update an issue file in this folder with the `.mmd` extension.
2. Run:

```bash
bun run issue:diagram -- agent-issues/<issue-name>.mmd
```

Optional output name:

```bash
bun run issue:diagram -- agent-issues/<issue-name>.mmd <png-name>
```

Generated images are written to `agent-issues/IMG/`.

The command prefers an installed Chrome/Edge executable and skips Puppeteer browser downloads by default.
