import express from 'express';
import {getPostId} from './lib/utils.js';
import {downloadPostComments} from './lib/fetch-comments.js';
import {formatForClaude} from './lib/format-prompt.js';

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON request bodies
app.use(express.json());

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

// Start the server
app.listen(port, () => {
    console.log(`HN Companion MCP server running on port ${port}`);
});
