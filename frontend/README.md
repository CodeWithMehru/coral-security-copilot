# CoralSec Copilot — Frontend

Enterprise Security & Compliance Monitor UI. **Live mode** executes real Coral SQL against bundled `github`, `notion`, and `slack` sources. **Demo mode** uses isolated sample data only when explicitly enabled.

## Run locally

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local — set CORALSEC_USE_DEMO=false and tokens
npm run dev
```

Also create `../.env` from `../.env.example` with `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `NOTION_TOKEN`, `SLACK_BOT_TOKEN`.

## Live mode (production)

Set in `frontend/.env.local`:

```bash
CORALSEC_USE_DEMO=false
CORALSEC_ROOT=..
CORAL_WORKDIR=..
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
```

Coral reads `GITHUB_TOKEN`, `NOTION_API_KEY` (or `NOTION_TOKEN`), and `SLACK_TOKEN` (or `SLACK_BOT_TOKEN`) from the environment. The app loads `../.env` automatically on the server.

### What runs in live mode

| Feature | Data source |
|---------|-------------|
| Agent Chat | Coral SQL (`github.*`, `notion.search`, `slack.channels`) with JOINs |
| Secret Scanner | `github.repo_secret_scanning_alerts` + Python compliance scan |
| Vulnerabilities | `github.repo_dependabot_alerts` (GHSA/CVE) + OSV from compliance scan |
| Compliance | `github.collaborators` × `notion.search` |
| Dashboard | Aggregated Coral queries + optional compliance scan |

No placeholder rows are injected when Coral returns empty — you see real empty states and configuration warnings.

## Demo mode

```bash
CORALSEC_USE_DEMO=true
```

Uses `lib/demo-data.ts` only. A banner explains demonstration mode.

## API routes

- `GET /api/config` — mode, GitHub scope, Coral source health
- `POST /api/coral/chat` — NL → Coral SQL
- `POST /api/coral/sql` — execute Coral CLI (demo uses virtual projection only when `CORALSEC_USE_DEMO=true`)
- `GET /api/secrets` | `/api/vulnerabilities` | `/api/compliance` | `/api/dashboard` | `/api/scan`

Agent Chat calls `/api/coral/chat` then `/api/coral/sql`.
