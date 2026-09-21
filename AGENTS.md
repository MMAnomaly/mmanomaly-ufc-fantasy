<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Draft clock

Live picks use `League.pickDeadline` (default length 120 seconds). Expiry autodrafts the best eligible fighter from `rankingJson` (champion, then numeric rank, then `lastFightDate`, then name) into an open weight-class slot, or Flex when that fighter does not match one. Details are in the README section “Pick clock and autodraft”.
