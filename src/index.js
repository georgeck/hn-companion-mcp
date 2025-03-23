import express from 'express';
import { getPostData } from './hn-fetcher.js';
import { generateSystemPrompt, generateUserPrompt } from './prompt-generator.js';
import { extractPostIdFromUrl } from './utils.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HN Companion MCP is running',
    endpoints: {
      '/summarize': 'POST - Summarize a Hacker News post by providing a postId or url'
    }
  });
});

// Summarization endpoint
app.post('/summarize', async (req, res) => {
  try {
    const { url, postId } = req.body;
    
    // Extract post ID from URL or use provided post ID
    let targetPostId;
    if (url) {
      targetPostId = extractPostIdFromUrl(url);
      if (!targetPostId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Invalid Hacker News URL' 
        });
      }
    } else if (postId) {
      targetPostId = postId;
    } else {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Either url or postId must be provided' 
      });
    }
    
    // Fetch the post data
    console.log(`Fetching post data for post ID: ${targetPostId}`);
    const { post, comments } = await getPostData(targetPostId);
    
    if (!post) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Post not found or error fetching post data' 
      });
    }
    
    // Generate prompts
    const systemPrompt = generateSystemPrompt();
    const userPrompt = generateUserPrompt(post, comments);
    
    // Return the prompts to Claude
    console.log(`Returning prompts for post: ${post.title} (${comments.size} comments)`);
    res.json({
      status: 'success',
      data: {
        postId: targetPostId,
        postTitle: post.title,
        commentCount: comments.size,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
      }
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      status: 'error', 
      message: `Error processing request: ${error.message}` 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`HN Companion MCP server running on port ${PORT}`);
});
