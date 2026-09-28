<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# A requested change goes live, without asking
When Chloe asks for a fix or a change, the job is finished only when it is live on `main`. Do not ask whether to deploy, whether to merge, or whether to open a pull request, and do not stop on a feature branch and report "ready to merge". Make the change, run the gate below, merge to `main`, push, and then report what shipped. Only stop to ask when the change itself is ambiguous or destructive (a migration that drops data, a change to money or wages logic you could not test), never for permission to ship.

# Before pushing to main
Pushing to `main` deploys to production. Before any push, run the `test-guard` subagent (`.claude/agents/test-guard.md`) and only push on a GO verdict. The git pre-push hook and the GitHub Actions `test` job both run `npm run check` (typecheck + all `src/**/*.test.ts` + `scripts/test-units.ts`) and block the push/deploy if it fails.
