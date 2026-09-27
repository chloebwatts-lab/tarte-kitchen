<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Before pushing to main
Pushing to `main` deploys to production. Before any push, run the `test-guard` subagent (`.claude/agents/test-guard.md`) and only push on a GO verdict. The git pre-push hook and the GitHub Actions `test` job both run `npm run check` (typecheck + all `src/**/*.test.ts` + `scripts/test-units.ts`) and block the push/deploy if it fails.
