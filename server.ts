import express from 'express';
import { getPostId } from './lib/utils.js';
import { downloadPostComments } from './lib/fetch-comments.js';
import { formatForClaude } from './lib/format-prompt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { MCPServer, MCPConfig } from '@modelcontextprotocol/sdk';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Read MCP config using absolute path
const mcpConfigPath = path.join(__dirname, 'mcp.json');
const mcpConfig: MCPConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));

// Initialize MCP server
const mcpServer = new MCPServer(mcpConfig);

// Handle REST API routes
const handleRESTRequest = async (req: express.Request, res: express.Response) => {
    // Regular REST API routes
    if (req.path === '/health') {
        return res.json({ status: 'ok' });
    }

    if (req.path === '/api/summarize' && req.method === 'POST') {
        try {
            const { input } = req.body;

            if (!input) {
                return res.status(400).json({ error: 'Missing input parameter' });
            }

            const postId = getPostId(input);

            if (!postId) {
                return res.status(400).json({
                    error: 'Invalid input. Please provide a valid Hacker News post ID or URL'
                });
            }

            // Download and process comments
            const { post, postComments } = await downloadPostComments(postId);

            // Format data for Claude
            const formattedData = formatForClaude(post, postComments);

            return res.json({
                status: 'success',
                data: formattedData
            });
        } catch (error) {
            console.error(`Error processing REST request: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return res.status(500).json({
                error: 'Failed to process request',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Default route for REST API
    return res.status(404).json({ error: 'Not found' });
};

// Create HTTP server
const server = http.createServer(app);

// Function to find an available port
const findAvailablePort = (startPort: number, maxAttempts = 10): Promise<number> => {
    return new Promise((resolve, reject) => {
        let currentPort = startPort;
        let attempts = 0;

        const tryPort = (port: number) => {
            const testServer = http.createServer();
            testServer.once('error', (err: NodeJS.ErrnoException) => {
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
                const foundPort = testServer.address()?.port;
                if (foundPort) {
                    testServer.close(() => {
                        resolve(foundPort);
                    });
                } else {
                    reject(new Error('Could not get port from test server'));
                }
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
        const desiredPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

        // Try to find an available port
        const port = await findAvailablePort(desiredPort);

        // Start server on the available port
        server.listen(port, () => {
            console.error(`HN Companion MCP server running on port ${port}`);
        });
    } catch (error) {
        console.error(`Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
};

// Start the server
console.error('Initializing server...');
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