import { getPostId } from './lib/utils.js';
import { downloadPostComments } from './lib/fetch-comments.js';
import { getSystemPrompt, getUserPrompt } from './lib/format-prompt.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from "@modelcontextprotocol/sdk/types.js";

const DEBUG = process.env.DEBUG === 'true';
function log(message, data) {
    if (DEBUG) {
        console.error(`[${new Date().toISOString()}] ${message}`, data || '');
    }
}

/**
 * Create an MCP server that can fetch HN discussions and format it for summarization.
 * HN post ID or URL is passed as input to the server.
 * The server fetches the post and comments, formats the data, and outputs it for Claude to summarize.
 * The MCP also returns a system prompt and user prompt for Claude to use.
 */
const server = new Server({
    name: "HackerNews companion MCP server",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {}
    },
});
/**
 * Handler that lists available tools.
 * Exposes the "get_hn_post_formatted_comments" tool that lets clients retrieve formatted HN post comments.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    log(`ListToolsRequestSchema`);
    return {
        tools: [
            {
                name: "get_hn_post_formatted_comments",
                description: "Retrieves and formats comments from a Hacker News discussion post for summarization by an LLM. Use the `hacker_news_summarization_user_prompt` prompts to generate a summary.",
                inputSchema: {
                    type: "object",
                    properties: {
                        post_url: {
                            type: "string",
                            description: "The URL or ID for the Hacker News post to analyze. Can be a full URL (https://news.ycombinator.com/item?id=43456723) or just the numeric post ID e.g. 43456723.",
                        }
                    },
                    required: ["post_url"],
                },
                outputSchema: {
                    type: "object",
                    properties: {
                        content: {
                            type: "array",
                            description: "Contains the formatted comments ('formattedComments') and user prompt ('userPrompt') - Follow the instructions in the `userPrompt` on interpreting the formatted comments.",
                        },
                        metadata: {
                            type: "object",
                            description: "Contains post ID (postId), comment count (commentCount), and original post URL (postUrl)."
                        }
                    }
                }
            }
        ]
    };
});
/**
 * Handler for the get_hn_post_formatted_comments tool.
 * Returns the HN Post comments formatted for summarization.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    log(`CallToolRequestSchema: ${request.params.name}`);
    switch (request.params.name) {
        case "get_hn_post_formatted_comments":
            {
                const post_url = String(request.params.arguments?.post_url).trim();
                if (!post_url) {
                    throw new Error("PostURL is required");
                }
                const postId = getPostId(post_url);
                if (!postId) {
                    throw new Error("Invalid post URL");
                }
                log(`Fetching comments for post ID: ${postId}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30 seconds timeout
                try {
                    const postResponseData = await downloadPostComments(postId);
                    let formattedComments = '';
                    postResponseData.postComments.forEach(comment => {
                        formattedComments += `[${comment.path}] (score: ${comment.score}) <replies: ${comment.replies}> {downvotes: ${comment.downvotes}} ${comment.author}: ${comment.text}\n`;
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: String(formattedComments),
                                description: "'formattedComments' - Formatted comments for post ID",
                            },
                            {
                                type: "text",
                                text: getSystemPrompt(),
                                description: "'userPrompt' - Follow the instructions in the `userPrompt` on interpreting the 'formattedComments' data."
                            }
                        ],
                        metadata: {
                            postId: postId,
                            commentCount: postResponseData.postComments.length,
                            postUrl: `https://news.ycombinator.com/item?id=${postId}`
                        }
                    };
                }
                catch (error) {
                    console.error("Error downloading comments:", error);
                    throw new Error(`Failed to download comment post: ${error.message}`);
                }
                finally {
                    clearTimeout(timeoutId);
                    controller.abort();
                }
            }
            break;
        default:
            throw new Error("Unknown tool");
    }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
process.on('SIGINT', () => {
    process.exit(0);
});
process.on('SIGTERM', () => {
    process.exit(0);
});
//# sourceMappingURL=server.js.map