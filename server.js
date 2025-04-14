import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupServer } from "./lib/server-setup.js";
import { runSseServer } from "./lib/sse-transport.js";

const DEBUG = process.env.DEBUG === 'true';

function log(message, data) {
    if (DEBUG) {
        console.error(`[${new Date().toISOString()}] ${message}`, data || '');
    }
}

// Determine transport method from command line arguments
const args = process.argv.slice(2);
const transportType = args.includes('--sse') ? 'sse' : 'stdio';
const port = args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1], 10) : 3000;

/**
 * Start the MCP server using the specified transport
 */
async function main() {
    if (transportType === 'sse') {
        // Start with SSE transport
        const { server, close } = await runSseServer({
            port,
            debug: DEBUG
        }, setupServer);

        // Handle process termination
        process.on('SIGINT', () => {
            log("Shutting down SSE server");
            close();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            log("Shutting down SSE server");
            close();
            process.exit(0);
        });
    } else {
        // Start with stdio transport (original implementation)
        const server = new Server({
            name: "HackerNews companion MCP server",
            version: "0.1.0",
        }, {
            capabilities: {
                tools: {}
            }
        });

        // Configure the server
        setupServer(server, log);

        // Connect using stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);

        // Handle process termination
        process.on('SIGINT', () => {
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            process.exit(0);
        });
    }
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});