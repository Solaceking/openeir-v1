# MCP guide

OpenEir speaks MCP (Model Context Protocol) in **both directions**, remotely only:

1. **Client** — OpenEir connects to MCP servers you configure (Settings → MCP → Connect).
2. **Server** — OpenEir exposes itself as an MCP server at `/api/mcp` so desktop
   assistants (Claude Desktop, any MCP client) can read the household's data
   (Settings → MCP → Expose).

v1 scope is **remote servers over streamable HTTP** (and SSE-framed responses).
OpenEir deliberately does NOT spawn local processes (no stdio servers) — a
medical app's web UI should never execute arbitrary local binaries. Revisit
later behind an explicit admin flag.

---

## Connect — OpenEir as an MCP client

Settings → MCP → **Connect to MCP servers**:

1. Paste the server's streamable-HTTP endpoint URL (e.g. `https://example.com/mcp`).
2. Optionally name the auth header (default `Authorization`) and its value
   (`Bearer …` is added automatically for that header). Values are stored
   AES-256-GCM encrypted, never returned to the browser after saving.
3. OpenEir performs the MCP handshake (`initialize` → `notifications/initialized`
   → `tools/list`) and shows every discovered tool with its description.
4. Toggle servers on/off; **re-probe** refreshes the tool list any time.

In v3.5 the registry provides discovery, status and audit groundwork. Eir
calling these tools inside chat lands in the next phase — the UI says so
honestly.

## Expose — OpenEir as an MCP server

Settings → MCP → **Expose this OpenEir via MCP**. Toggle it on; you get a
personal token (shown **once**, only its sha256 is stored). Point any MCP
client at:

```json
{
  "url": "https://your-openeir-host/api/mcp",
  "headers": { "Authorization": "Bearer <your-token>" }
}
```

Transport: MCP streamable HTTP (JSON-RPC 2.0 over POST; `GET` returns 405,
`DELETE` ends a session politely). SSE-framed responses are accepted from us,
plain JSON is sent. `initialize` reports serverInfo `OpenEir` and the current
app version; the protocol version is `2025-03-26`.

### Tools exposed (all read-only)

| Tool | Returns |
| --- | --- |
| `get_today_summary` | One-paragraph day summary: latest BP & glucose, meds status |
| `get_recent_readings` | Recent BP and/or glucose readings, newest first (`kind`, `limit` 1–20) |
| `get_medications_now` | Active medications with today's dose status per slot |
| `get_profile_summary` | Name, conditions, clinical targets, GP contact |

Every `tools/call` is audit-logged as an `EventRecord` (`type: MCP_TOOL_CALL`,
low priority) with the tool name and a truncated args summary — visible in your
own database, never sent anywhere. The endpoint is rate-limited (60 req/min per
IP). Rotate the token any time; the old one stops working immediately.

## WebMCP

The emerging WebMCP browser proposal (pages exposing tools to the browser's
agent) is on the roadmap — the exposed server side already speaks the shape
browsers will need. Settings shows it as *Coming soon* until browsers ship it.
