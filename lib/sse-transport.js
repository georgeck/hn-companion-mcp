import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import express from "express";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * Initialize and run an MCP server using SSE transport
 * @param {object} options - Server configuration options
 * @param {number} options.port - Port to run the server on (default: 3000)
 * @param {boolean} options.debug - Whether to enable debug logging
 * @param {function} serverSetupFn - Function to configure the server
 */
export async function runSseServer(options, serverSetupFn) {
    const port = options.port || 3000;
    const DEBUG = options.debug === true;

    function log(message, data) {
        if (DEBUG) {
            console.error(`[${new Date().toISOString()}] ${message}`, data || '');
        }
    }

    // Create Express app
    const app = express();

    // Create the MCP server
    const server = new Server({
        name: "HackerNews companion MCP server",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {}
        }
    });

    // Let the main setup function configure the server
    if (typeof serverSetupFn === 'function') {
        serverSetupFn(server, log);
    }

    // Set up SSE transport
    let transport = null;

    app.get("/sse", (req, res) => {
        log("SSE connection established");
        transport = new SSEServerTransport("/messages", res);
        server.connect(transport);
    });

    app.post("/messages", (req, res) => {
        if (transport) {
            log("Received POST message");
            transport.handlePostMessage(req, res);
        } else {
            res.status(400).json({error: "No active SSE connection"});
        }
    });

    // Start the HTTP server
    return new Promise((resolve) => {
        const httpServer = app.listen(port, () => {
            log(`SSE server running on http://localhost:${port}`);
            resolve({
                server,
                close: () => {
                    httpServer.close();
                    if (transport) {
                        transport.close();
                    }
                }
            });
        });
    });
}