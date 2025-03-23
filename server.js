import express from 'express';
import {getPostId} from './lib/utils.js';
import {downloadPostComments} from './lib/fetch-comments.js';
import {formatForClaude} from './lib/format-prompt.js';
import fs from 'fs';

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON request bodies
app.use(express.json());

// Read MCP config
const mcpConfig = JSON.parse(fs.readFileSync('./mcp.json', 'utf8'));

// Root endpoint - responds to the MCP protocol initialization
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'HN Companion MCP is running',
        endpoints: {
            '/api/summarize': 'POST - Summarize a Hacker News post by providing an input parameter'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({status: 'ok'});
});

// MCP endpoint for Hacker News summarization
app.post('/api/summarize', async (req, res) => {
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

        res.json({
            status: 'success',
            data: formattedData
        });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({
            error: 'Failed to process request',
            message: error.message
        });
    }
});

// JSON-RPC endpoint for MCP protocol
app.post('/', async (req, res) => {
    const rpcRequest = req.body;
    console.log('[info] [hn-companion] Received RPC request:', JSON.stringify(rpcRequest));
    
    if (rpcRequest.method === 'initialize') {
        // Handle initialize method
        return res.json({
            jsonrpc: '2.0',
            id: rpcRequest.id,
            result: {
                capabilities: {},
                serverInfo: {
                    name: mcpConfig.name,
                    version: mcpConfig.version
                }
            }
        });
    } 
    else if (rpcRequest.method === 'invoke') {
        // Handle invoke method for summarize endpoint
        try {
            const { endpoint, params } = rpcRequest.params;
            
            if (endpoint !== 'summarize') {
                return res.json({
                    jsonrpc: '2.0',
                    id: rpcRequest.id,
                    error: {
                        code: -32601,
                        message: `Endpoint '${endpoint}' not found`
                    }
                });
            }
            
            const { input } = params;
            if (!input) {
                return res.json({
                    jsonrpc: '2.0',
                    id: rpcRequest.id,
                    error: {
                        code: -32602,
                        message: 'Missing required parameter: input'
                    }
                });
            }
            
            const postId = getPostId(input);
            if (!postId) {
                return res.json({
                    jsonrpc: '2.0',
                    id: rpcRequest.id,
                    error: {
                        code: -32602,
                        message: 'Invalid input. Please provide a valid Hacker News post ID or URL'
                    }
                });
            }
            
            // Download and process comments
            const { post, postComments } = await downloadPostComments(postId);
            
            // Format data for Claude
            const formattedData = formatForClaude(post, postComments);
            
            return res.json({
                jsonrpc: '2.0',
                id: rpcRequest.id,
                result: {
                    status: 'success',
                    data: formattedData
                }
            });
        } catch (error) {
            console.error('[error] [hn-companion] Error processing invoke request:', error);
            return res.json({
                jsonrpc: '2.0',
                id: rpcRequest.id,
                error: {
                    code: -32603,
                    message: `Internal error: ${error.message}`
                }
            });
        }
    }
    
    // Return error for unknown methods
    res.json({
        jsonrpc: '2.0',
        id: rpcRequest.id || null,
        error: {
            code: -32601,
            message: 'Method not found'
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`HN Companion MCP server running on port ${port}`);
});
