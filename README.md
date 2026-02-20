# Real KB MCP Server

An MCP (Model Context Protocol) server that searches across YouTrack knowledge base articles (PRDs, RFCs, documentation) and the Real Brokerage support site to help answer product questions.

## Tools

The server exposes 5 tools:

### `ask_product_question`

The primary tool. Searches both YouTrack KB and the support site in parallel, fetches full article content, and returns combined results for the LLM to synthesize an answer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | yes | - | The product question to research |
| `max_kb_articles` | number | no | 5 | Max YouTrack KB articles to fetch |
| `max_support_articles` | number | no | 3 | Max support articles to fetch |

After receiving results, the LLM is instructed to also look into the code for each microservice mentioned in the articles to provide a comprehensive, code-informed answer.

### `search_kb_articles`

Search YouTrack knowledge base articles and return titles, IDs, and content previews.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | yes | - | Search query |
| `limit` | number | no | 10 | Max results to return |

### `get_kb_article`

Fetch the full content of a specific YouTrack KB article by its ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `article_id` | string | yes | - | Article ID (e.g., `RV2-A-123`) |

### `search_support_site`

Search the Real Brokerage support site and return article titles and URLs.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | yes | - | Search query |
| `limit` | number | no | 5 | Max results to return |

### `get_support_article`

Fetch the full content of a specific support article by its URL.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | yes | - | Full URL of the support article |

## Data Sources

- **YouTrack Knowledge Base** - PRDs, RFCs, and internal documentation stored as YouTrack articles. Accessed via the YouTrack REST API (`/api/articles`). Requires authentication.
- **Real Brokerage Support Site** - Public-facing help articles at `support.therealbrokerage.com`. Accessed via the Zendesk Help Center API (`/api/v2/help_center/articles/search.json`). No authentication required.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTRACK_BASE_URL` | yes | YouTrack instance URL (e.g., `https://example.youtrack.cloud`) |
| `YOUTRACK_TOKEN` | yes | YouTrack API token with KB read access |
| `YOUTRACK_DEFAULT_PROJECT` | no | Default project key for article queries (e.g., `RV2`) |

## Installation

### Via Maestro (recommended)

If you have [maestro](https://github.com/Realtyka/maestro) installed:

```bash
maestro init
# Select "real-kb" from the list and provide your YouTrack credentials
```

This configures the server for both Claude Code and Claude Desktop automatically.

### Manual Setup - Docker

Pull the image and configure your MCP client.

#### Claude Code (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "real-kb": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--pull=always",
        "-e", "YOUTRACK_BASE_URL",
        "-e", "YOUTRACK_TOKEN",
        "-e", "YOUTRACK_DEFAULT_PROJECT",
        "ghcr.io/realtyka/real-kb-mcp-server:latest"
      ],
      "env": {
        "YOUTRACK_BASE_URL": "https://your-instance.youtrack.cloud",
        "YOUTRACK_TOKEN": "your-api-token",
        "YOUTRACK_DEFAULT_PROJECT": "RV2"
      }
    }
  }
}
```

#### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "real-kb": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--pull=always",
        "-e", "YOUTRACK_BASE_URL",
        "-e", "YOUTRACK_TOKEN",
        "-e", "YOUTRACK_DEFAULT_PROJECT",
        "ghcr.io/realtyka/real-kb-mcp-server:latest"
      ],
      "env": {
        "YOUTRACK_BASE_URL": "https://your-instance.youtrack.cloud",
        "YOUTRACK_TOKEN": "your-api-token",
        "YOUTRACK_DEFAULT_PROJECT": "RV2"
      }
    }
  }
}
```

### Manual Setup - Node.js

If you prefer running without Docker:

```bash
git clone https://github.com/ashish-r-venkannagari/real-kb.git
cd real-kb
npm install
npm run build
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "real-kb": {
      "command": "node",
      "args": ["/path/to/real-kb/dist/index.js"],
      "env": {
        "YOUTRACK_BASE_URL": "https://your-instance.youtrack.cloud",
        "YOUTRACK_TOKEN": "your-api-token",
        "YOUTRACK_DEFAULT_PROJECT": "RV2"
      }
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with tsx)
npm run dev

# Build
npm run build

# Run production build
npm start
```

### Building the Docker Image

```bash
docker build -t ghcr.io/realtyka/real-kb-mcp-server:latest .
```

## Project Structure

```
src/
  index.ts          # Server entrypoint - creates MCP server and stdio transport
  tools.ts          # Registers all 5 MCP tools with zod schemas
  youtrack-kb.ts    # YouTrack REST API client for KB article search/fetch
  support-site.ts   # Zendesk Help Center API client for support article search/fetch
```

## CI/CD

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds and publishes the Docker image on release or manual dispatch. It builds multi-platform images (linux/amd64, linux/arm64) and pushes to the container registry.

## Generating a YouTrack API Token

1. Go to your YouTrack instance
2. Click your avatar and select **Hub Account**
3. Go to the **Account Security** tab
4. Click **New token...**
5. Name it (e.g., "MCP Integration")
6. Add scope: **YouTrack (Full access)**
7. Click **Create** and copy the token
