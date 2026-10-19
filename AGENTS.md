<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# A requested change goes live, without asking
When Chloe asks for a fix or a change, the job is finished only when it is live on `main`. Do not ask whether to deploy, whether to merge, or whether to open a pull request, and do not stop on a feature branch and report "ready to merge". Make the change, run the gate below, merge to `main`, push, and then report what shipped. Only stop to ask when the change itself is ambiguous or destructive (a migration that drops data, a change to money or wages logic you could not test), never for permission to ship.

# Before pushing to main
Pushing to `main` deploys to production. Before any push, run the `test-guard` subagent (`.claude/agents/test-guard.md`) and only push on a GO verdict. The git pre-push hook and the GitHub Actions `test` job both run `npm run check` (typecheck + all `src/**/*.test.ts` + `scripts/test-units.ts`) and block the push/deploy if it fails.

# How Chloe wants replies (Chloe, 19 Oct 2026)
Chloe runs Tarte and reads replies on her phone between other things.

- Lead with the answer in one or two lines. Then at most three short bullets. Stop.
- Insight over detail: say what it means and what she should do, not how you found it.
- Do not list what you checked, the files you read, or options you rejected.
- No em dashes, no AI tells. Plain Australian English.
- If she wants more she will ask. Offer depth in one line at most, never pre-emptively write it.
- She gives permission readily: when something needs her to connect, approve or re-authorise, say exactly what to click in one line and move on with everything else.
