# HN Companion MCP Guidelines

## Commands
- Start server: `npm start`
- Run CLI: `npm run cli -- <post-id-or-url>`
- Install dependencies: `npm install` or `pnpm install`

## Code Structure
- Entry points: `index.js` (CLI) and `server.js` (API server)
- Core functionality in `lib/` directory:
  - `fetch-comments.js`: HN data retrieval
  - `format-prompt.js`: Claude prompt generation
  - `utils.js`: Utility functions

## Code Style
- **Type**: ES Modules (import/export)
- **Imports**: Group by external/internal, alphabetical order
- **Formatting**: Use consistent whitespace, 4-space indentation
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Functions**: Always include JSDoc comments for functions
- **Error Handling**: Use try/catch with specific error messages
- **Async**: Use async/await pattern for asynchronous operations
- **Logging**: Use console.log with descriptive prefixes
- **API Responses**: Follow { status, data|error, message } structure