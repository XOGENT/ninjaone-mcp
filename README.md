# NinjaOne MCP Server

A Model Context Protocol (MCP) server for interacting with NinjaOne, featuring a decision tree architecture for efficient tool loading.


> [!NOTE]
> This is the **XOGENT fork** of [`wyre-technology/ninjaone-mcp`](https://github.com/wyre-technology/ninjaone-mcp).
> The deploy buttons and `.do/app.yaml` below point at `XOGENT/ninjaone-mcp`, so
> they deploy *this* fork. The npm dependency
> (`@wyre-technology/node-ninjaone`) is still pulled from the upstream org's
> GitHub Packages registry — that has not changed, and neither has the token
> requirement described below.

## One-Click Deployment

> [!IMPORTANT]
> **Before you click:** this server depends on `@wyre-technology/node-ninjaone`,
> which is hosted on the **GitHub Packages** npm registry. GitHub Packages has no
> anonymous access — even though the package is public, every `npm install` needs a
> token. The cloud builder runs `npm install` for you, so you must give it one, or
> the build fails with `npm error 401 Unauthorized ... npm.pkg.github.com`.
>
> 1. Create a GitHub **Personal Access Token** with the `read:packages` scope
>    ([classic token](https://github.com/settings/tokens/new?scopes=read:packages&description=ninjaone-mcp%20deploy)).
>    Any GitHub account works — you do **not** need to be a member of the
>    `wyre-technology` or `XOGENT` org to read the public package. The scope really
>    is required: a token without `read:packages` gets `403 ... does not match
>    expected scopes` rather than a clean 401, so double-check it.
> 2. Add it as a build variable when prompted by the deploy flow:
>    - **Cloudflare Workers** → set a build variable named **`NODE_AUTH_TOKEN`** to your PAT
>      (Workers → Settings → Build → Variables and Secrets).
>    - **DigitalOcean App Platform** → set an encrypted env var named **`GITHUB_TOKEN`**
>      with scope **Build Time** to your PAT (the `.do/app.yaml` already declares it).

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/XOGENT/ninjaone-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/XOGENT/ninjaone-mcp)

> [!NOTE]
> Both targets run the **full** MCP server. DigitalOcean builds the Docker image and
> serves it over HTTP; Cloudflare Workers serves the same server via the SDK's Web
> Standard Streamable HTTP transport (`src/worker.ts`). After deploying, set your
> NinjaOne credentials as secrets — `NINJAONE_CLIENT_ID`, `NINJAONE_CLIENT_SECRET`,
> and optionally `NINJAONE_REGION` — or set `AUTH_MODE=gateway` to take credentials
> per-request from `X-Ninja-*` headers. The MCP endpoint is `/mcp`; `/health` is an
> unauthenticated liveness probe.

Want to run it on your own machine first? See
[Running Locally with Docker](#running-locally-with-docker) — the prebuilt-image
path needs no token at all.

## Architecture

This MCP server uses a **hierarchical tool loading approach** instead of exposing all tools upfront:

1. **Navigation Phase**: Initially exposes only a navigation tool (`ninjaone_navigate`)
2. **Domain Selection**: User selects a domain (devices, organizations, alerts, tickets)
3. **Domain Tools**: Server exposes domain-specific tools after selection
4. **Lazy Loading**: Domain handlers and the NinjaOne client are loaded on-demand

This architecture provides:
- Reduced cognitive load (fewer tools to choose from)
- Faster initial load times
- Better organization of related operations
- Clear navigation state

## Installation

This package is published to the **GitHub Packages** npm registry, which requires a
token even for public packages. Authenticate once, then install:

```bash
# Authenticate npm to GitHub Packages (token needs the read:packages scope)
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages

npm install @wyre-technology/ninjaone-mcp
```

The repo's `.npmrc` already points the `@wyre-technology` scope at GitHub Packages and
reads the token from `NODE_AUTH_TOKEN`, so no further config is needed. The same applies
to `npx @wyre-technology/ninjaone-mcp` below. Prefer a zero-setup option? Use the prebuilt
container image (`ghcr.io/wyre-technology/ninjaone-mcp`) or the `.mcpb` bundle attached to
each [release](https://github.com/wyre-technology/ninjaone-mcp/releases).

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NINJAONE_CLIENT_ID` | Yes | OAuth 2.0 Client ID |
| `NINJAONE_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `NINJAONE_REGION` | No | Region: `us` (default), `eu`, `oc`, `ca`, `us2`, or `fed` |
| `NINJAONE_SCOPES` | No | OAuth scopes to request. Defaults to `monitoring,management`. Set this if your API app is granted a narrower set — see [OAuth scopes](#oauth-scopes) |

### NinjaOne API Regions

| Region | Base URL |
|--------|----------|
| `us` | `https://app.ninjarmm.com` |
| `eu` | `https://eu.ninjarmm.com` |
| `oc` | `https://oc.ninjarmm.com` |
| `ca` | `https://ca.ninjarmm.com` |
| `us2` | `https://us2.ninjarmm.com` |
| `fed` | `https://fed.ninjarmm.com` |

## Usage

### Running Standalone

```bash
# Set credentials
export NINJAONE_CLIENT_ID="your-client-id"
export NINJAONE_CLIENT_SECRET="your-client-secret"
export NINJAONE_REGION="us"

# Run the server
npx @wyre-technology/ninjaone-mcp
```

### Claude Desktop Configuration

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ninjaone": {
      "command": "npx",
      "args": ["@wyre-technology/ninjaone-mcp"],
      "env": {
        "NINJAONE_CLIENT_ID": "your-client-id",
        "NINJAONE_CLIENT_SECRET": "your-client-secret",
        "NINJAONE_REGION": "us"
      }
    }
  }
}
```

## Running Locally with Docker

`docker-compose.yml` defines three ways to run the server locally. All of them
serve the MCP endpoint at `http://localhost:8080/mcp`, with `/health` as an
unauthenticated liveness probe.

First, create your `.env`:

```bash
cp .env.example .env
```

Fill in `NINJAONE_CLIENT_ID` and `NINJAONE_CLIENT_SECRET` (see
[Authentication](#authentication) for how to create the API app). Every other
variable has a working default. `.env` is gitignored and excluded from the Docker
build context.

### Option A — prebuilt image (no GitHub token needed)

The fastest path: pull the published image instead of compiling from source, so
the GitHub Packages token is never involved.

```bash
docker compose --profile prebuilt up ninjaone-mcp-prebuilt
```

```bash
curl http://localhost:8080/health
```

The published image is `linux/amd64` only, so on Apple Silicon it runs under
emulation — slightly slower to start, otherwise identical. Override the image or
platform with `PREBUILT_IMAGE` / `PREBUILT_PLATFORM` in `.env` if you publish
your own.

### Option B — build from source

Building runs `npm ci`, which installs `@wyre-technology/node-ninjaone` from
GitHub Packages and therefore **requires a token with the `read:packages` scope**
([create one](https://github.com/settings/tokens/new?scopes=read:packages&description=ninjaone-mcp%20local)).
A plain `gh auth token` is usually *not* enough — the default `gh` scopes omit
`read:packages`, and you'll get `npm error code E403 ... does not match expected
scopes`.

```bash
export GITHUB_TOKEN=ghp_your_token_with_read_packages
```

```bash
docker compose up --build ninjaone-mcp
```

The token is passed as a BuildKit secret, so it never lands in the image layers.
You can also put `GITHUB_TOKEN=` in `.env` instead of exporting it.

### Option C — development, with rebuild-on-save

Mounts your working tree into the container, recompiles TypeScript on save, and
restarts the server when `dist/` changes. Published on port **8081** so it can
run alongside Option A or B.

```bash
docker compose --profile dev up --build ninjaone-mcp-dev
```

### Connecting a client

Point any Streamable-HTTP MCP client at `http://localhost:8080/mcp`. To check it
by hand:

```bash
curl -s -X POST http://localhost:8080/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

For Claude Desktop, the stdio transport is usually a better fit than a container
— see [Claude Desktop Configuration](#claude-desktop-configuration) above.

### Local Docker troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `npm error code E403 ... does not match expected scopes` during build | Your `GITHUB_TOKEN` lacks `read:packages`. Create a new PAT with that scope, or use Option A. |
| `npm error 401 Unauthorized ... npm.pkg.github.com` during build | No token reached the build. Export `GITHUB_TOKEN` (or set it in `.env`) before `docker compose up --build`. |
| `Bind for 0.0.0.0:8080 failed: port is already allocated` | Something else owns port 8080. Set `HOST_PORT=9090` in `.env`. |
| `/health` returns `ok` but every tool call fails auth | Credentials are missing or wrong, or `AUTH_MODE=gateway` is set without a gateway. `/health` is deliberately shallow and never checks credentials. |
| Token exchange fails with `400 invalid_scope` | Your NinjaOne API app was granted fewer scopes than the `monitoring management` default. Set `NINJAONE_SCOPES` to match — see [OAuth scopes](#oauth-scopes). |

### Plain `docker` (without compose)

```bash
docker build --secret id=github_token,env=GITHUB_TOKEN -t ninjaone-mcp .
```

```bash
docker run --rm -p 8080:8080 -e MCP_TRANSPORT=http -e AUTH_MODE=env -e NINJAONE_CLIENT_ID=xxx -e NINJAONE_CLIENT_SECRET=xxx -e NINJAONE_REGION=us ninjaone-mcp
```

## Available Domains

### Devices
Manage endpoints, reboot devices, view services and alerts.

Tools:
- `ninjaone_devices_list` - List devices, filterable by organization, device class, and online status. Paginated: a full page returns `hasMore: true` and a `cursor` to pass back for the next page.
- `ninjaone_devices_get` - Get device details
- `ninjaone_devices_reboot` - Schedule a device reboot
- `ninjaone_devices_services` - List Windows services on a device
- `ninjaone_devices_alerts` - Get device-specific alerts
- `ninjaone_devices_activities` - View device activity log

### Organizations
Manage customer organizations and their resources.

Tools:
- `ninjaone_organizations_list` - List organizations
- `ninjaone_organizations_get` - Get organization details
- `ninjaone_organizations_create` - Create a new organization
- `ninjaone_organizations_locations` - List organization locations
- `ninjaone_organizations_devices` - List devices for an organization

### Alerts
View and manage alerts across all devices.

Tools:
- `ninjaone_alerts_list` - List alerts with filters
- `ninjaone_alerts_get` - Get a single alert by UID (renders as an interactive card in MCP Apps hosts)
- `ninjaone_alerts_reset` - Reset/dismiss a single alert
- `ninjaone_alerts_reset_all` - Reset all alerts for a device or organization
- `ninjaone_alerts_summary` - Get alert count summary

Features:
- **Interactive Alert Card (MCP Apps, SEP-1865)**: `ninjaone_alerts_get` renders as an interactive card in MCP Apps hosts (Claude Desktop/web) with an in-card "Reset alert" round-trip via `ninjaone_alerts_reset`; neutral by default, brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars; plain-JSON behavior is unchanged in other hosts

### Tickets
Manage service tickets.

Tools:
- `ninjaone_tickets_list` - List tickets from a board (requires `board_id`; `status`/`organization_id`/`device_id` filters are applied client-side, see notes below)
- `ninjaone_tickets_get` - Get ticket details
- `ninjaone_tickets_create` - Create a new ticket
- `ninjaone_tickets_update` - Update an existing ticket
- `ninjaone_tickets_add_comment` - Add a comment to a ticket
- `ninjaone_tickets_comments` - Get ticket comments
- `ninjaone_tickets_boards_list` - List ticket boards (to discover `board_id` values)

> **Note:** NinjaOne queries tickets per board, and board IDs vary by tenant —
> board 1 is *not* always the "All Tickets" board, so `ninjaone_tickets_list`
> requires an explicit `board_id` rather than silently guessing one. Discover
> IDs with `ninjaone_tickets_boards_list`; on tenants where that endpoint
> returns 404, read the numeric ID from the board link's URL in the NinjaOne
> web UI (e.g. the "All tickets" sidebar link).
>
> **Note:** NinjaOne's board-run API cannot filter tickets by status,
> organization, or device server-side (attempting to throws a generic
> `Bad request`). `ninjaone_tickets_list` therefore applies those filters
> **client-side within one board page**. The response separates `count` (matches
> in this page) from `scanned` (tickets examined) and includes `hasMore`/`cursor`
> — page through until `hasMore` is `false` to get every match, and never treat a
> single page's `count` as a board-wide total. Status is matched against each
> ticket's status display name, so custom board statuses may not map to the
> `OPEN`/`IN_PROGRESS`/`WAITING`/`CLOSED` values.
>
> Similarly, `ninjaone_devices_list` filters by `organization_id` through
> NinjaOne's dedicated per-organization endpoint (the general `df=org` device
> filter is unreliable and can silently return the full fleet).

## Navigation Tools

Always available:
- `ninjaone_navigate` - Select a domain to work with
- `ninjaone_status` - Show current state and credential status
- `ninjaone_back` - Return to main menu (when in a domain)

## Example Workflow

```
User: Check my devices
Claude: [calls ninjaone_navigate with domain="devices"]
       -> Navigated to devices domain. Available tools: ...

User: List all Windows servers
Claude: [calls ninjaone_devices_list with device_class="WINDOWS_SERVER"]
       -> [device list results]

User: Now show me alerts
Claude: [calls ninjaone_back]
       -> Navigated back to main menu.
       [calls ninjaone_navigate with domain="alerts"]
       -> Navigated to alerts domain.
```

## Authentication

NinjaOne uses OAuth 2.0 for authentication. You need to:

1. Log in to your NinjaOne dashboard
2. Go to Administration > Apps > API
3. Create a new API application (application platform: **API Services**, grant type **Client Credentials**)
4. Grant it the scopes you need — see below
5. Note the Client ID and Client Secret
6. Configure the environment variables

The client library handles token refresh automatically.

### OAuth scopes

By default the server requests `monitoring management`. Which scopes you actually
need depends on what you use:

| Scope | Needed for |
|-------|-----------|
| `monitoring` | All read operations — listing devices, organizations, alerts, and tickets |
| `management` | Write operations — rebooting devices, resetting alerts, creating/updating tickets and organizations |
| `control` | Not used by this server |

**If your API app is granted fewer scopes than the default, set `NINJAONE_SCOPES`
to match.** NinjaOne rejects a token request that asks for a scope the app was
never granted — it returns `400 invalid_scope` rather than narrowing the grant —
so the failure happens at the token exchange and *every* tool call fails, including
reads. For a monitoring-only app:

```bash
export NINJAONE_SCOPES="monitoring"
```

Values may be comma- or space-separated and are case-insensitive. In gateway
deployments the same value can be supplied per request via the `X-Ninja-Scopes`
header.

## License

Apache-2.0
