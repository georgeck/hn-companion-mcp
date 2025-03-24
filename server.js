import express from 'express';
import {getPostId} from './lib/utils.js';
import {downloadPostComments} from './lib/fetch-comments.js';
import {formatForClaude} from './lib/format-prompt.js';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import http from 'http';
import { MCPServer } from '@modelcontextprotocol/sdk'; // Import MCP SDK

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Read MCP config using absolute path
const mcpConfigPath = path.join(__dirname, 'mcp.json');
const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));

// Handle stdout/stderr pipe when running under MCP
const isRunningUnderMCP = process.env.MCP_SERVER_NAME;
if (isRunningUnderMCP) {
    console.log = (...args) => process.stdout.write(JSON.stringify({
        jsonrpc: "2.0", method: "log", params: {message: args.join(' ')}
    }) + '\n');
    console.error = (...args) => process.stderr.write(args.join(' ') + '\n');
}

// Separate handlers for the MCP protocol routes vs. the REST API routes
const handleRESTRequest = async (req, res) => {
    // Regular REST API routes
    if (req.path === '/health') {
        return res.json({status: 'ok'});
    }

    if (req.path === '/api/summarize' && req.method === 'POST') {
        try {
            const {input} = req.body;

            if (!input) {
                return res.status(400).json({error: 'Missing input parameter'});
            }

            const postId = getPostId(input);

            if (!postId) {
                return res.status(400).json({
                    error: 'Invalid input. Please provide a valid Hacker News post ID or URL'
                });
            }

            // Download and process comments
            const {post, postComments} = await downloadPostComments(postId);

            // Format data for Claude
            const formattedData = formatForClaude(post, postComments);

            return res.json({
                status: 'success', data: formattedData
            });
        } catch (error) {
            console.error(`Error processing REST request: ${error.message}`);
            return res.status(500).json({
                error: 'Failed to process request', message: error.message
            });
        }
    }

    // Default route for REST API
    return res.status(404).json({error: 'Not found'});
};

// Initialize MCP server
const mcpServer = new MCPServer(mcpConfig);

mcpServer.on('summarize', async (params) => {
    const { input } = params;
    if (!input) {
        throw new Error('Missing required parameter: input');
    }

    const postId = getPostId(input);
    if (!postId) {
        throw new Error('Invalid input. Please provide a valid Hacker News post ID or URL');
    }

    console.error(`Processing HN post ID: ${postId}`);

    // Download and process comments
    const { post, postComments } = await downloadPostComments(postId);

    console.error(`Downloaded post "${post.title}" with ${postComments.size} comments`);

    // Format data for Claude
    const formattedData = formatForClaude(post, postComments);

    return formattedData;
});

// Route handler based on content type and headers
app.use((req, res, next) => {
    // Check if this is an MCP request (JSON-RPC)
    const isMCPRequest = req.headers['content-type'] === 'application/json' && (req.path === '/' || req.path === '/mcp');

    if (isMCPRequest) {
        return mcpServer.handleRequest(req, res);
    } else {
        return handleRESTRequest(req, res);
    }
});

// Create HTTP server
const server = http.createServer(app);

// Function to find an available port
const findAvailablePort = (startPort, maxAttempts = 10) => {
    return new Promise((resolve, reject) => {
        let currentPort = startPort;
        let attempts = 0;

        const tryPort = (port) => {
            const testServer = http.createServer();
            testServer.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    testServer.close();
                    if (attempts < maxAttempts) {
                        attempts++;
                        tryPort(port + 1);
                    } else {
                        reject(new Error(`Could not find available port after ${maxAttempts} attempts`));
                    }
                } else {
                    reject(err);
                }
            });

            testServer.once('listening', () => {
                const foundPort = testServer.address().port;
                testServer.close(() => {
                    resolve(foundPort);
                });
            });

            testServer.listen(port);
        };

        tryPort(currentPort);
    });
};

// Start the server with port detection
const startServer = async () => {
    try {
        // Get desired port from env or use default
        const desiredPort = process.env.PORT || 3000;

        // Try to find an available port
        const port = await findAvailablePort(desiredPort);

        // Start server on the available port
        server.listen(port, () => {
            console.error(`HN Companion MCP server running on port ${port}`);
        });
    } catch (error) {
        console.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    }
};

// Start the server
startServer();

// Handle process termination
process.on('SIGINT', () => {
    console.error('Received SIGINT, shutting down server');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down server');
    server.close(() => {
        process.exit(0);
    });
});
