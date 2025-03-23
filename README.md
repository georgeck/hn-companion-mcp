# Hacker News Companion MCP

A Model Context Protocol (MCP) for summarizing Hacker News discussions using Claude.

## Overview

This MCP fetches and processes Hacker News discussions, preparing them in a format that Claude can use to generate high-quality summaries. It handles both the hierarchical structure of comments and their metadata (scores, downvotes, etc.) to help Claude understand the relative importance and relationships of different comments.

## Features

- Process Hacker News URLs or post IDs
- Download and analyze comment structure from HN
- Score comments based on community engagement
- Format data optimized for Claude's summarization

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/hn-companion-mcp.git
   cd hn-companion-mcp
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Usage

### CLI

```bash
node index.js <post-id-or-url>
```

Example:
```bash
node index.js 43448075
# or
node index.js https://news.ycombinator.com/item?id=43448075
```

### API Server

Start the server:
```bash
npm start
```

Make a request:
```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"input": "https://news.ycombinator.com/item?id=43448075"}'
```

## API Reference

### `POST /api/summarize`

Request body:
```json
{
  "input": "https://news.ycombinator.com/item?id=43448075"
}
```

Response:
```json
{
  "status": "success",
  "data": {
    "systemPrompt": "...",
    "userPrompt": "...",
    "commentPathIdMapping": { ... },
    "postTitle": "...",
    "postId": "...",
    "commentCount": 123
  }
}
```

## Integration with Claude

This MCP is designed to prepare data for Claude to summarize. When a user asks Claude to summarize a Hacker News discussion, Claude can call this MCP to get the formatted data and then generate a summary based on the provided system and user prompts.

## License

MIT
