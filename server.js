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
        tools: {},
        prompts: {},
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
                            description: "The URL or ID for the Hacker News post to analyze. Can be a full URL (https://news.ycombinator.com/item?id=43456723) or just the numeric post ID.",
                        }
                    },
                    required: ["post_url"],
                },
                outputSchema: {
                    type: "object",
                    properties: {
                        content: {
                            type: "array",
                            description: "Contains the formatted comments and post title -  Use the `hacker_news_summarization_user_prompt` prompts to generate a summary."
                        },
                        metadata: {
                            type: "object",
                            description: "Contains post ID, comment count, and original post URL"
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
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
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
                                text: String(postResponseData.post.title),
                                description: "postTitle - The title of the Hacker News post"
                            },
                            {
                                type: "text",
                                text: String(formattedComments),
                                description: "'formattedComments' - The formatted comments from the Hacker News post. Use the `hacker_news_summarization_user_prompt` prompts to generate a summary."
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
 * Handler that lists available prompts.
 * Exposes a system prompt and user prompt for summarization.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    log(`ListPromptsRequestSchema`);
    return {
        prompts: [
            {
                name: "hacker_news_summarization_user_prompt",
                description: "User prompt for summarizing a Hacker News discussion post retrieved by the get_hn_post_formatted_comments tool call.",
                arguments: [
                    {
                        name: "postTitle",
                        type: "string",
                        description: "The title of the Hacker News post"
                    },
                    {
                        name: "formattedComments",
                        type: "string",
                        description: "The formatted comments from the Hacker News post as returned by the get_hn_post_formatted_comments tool call"
                    }
                ]
            }
        ]
    };
});
/**
 * Handler for the hacker_news_summarization_user_prompt.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
    log(`GetPromptRequestSchema: ${request.params.name}`);

    if (request.params.name === "hacker_news_summarization_user_prompt") {
        const { arguments: args } = request.params;
        if (!args || !args.postTitle || !args.formattedComments) {
            throw new Error("Missing required arguments: postTitle and/or formattedComments");
        }
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: getSystemPrompt() + getUserPrompt(String(args.postTitle), String(args.formattedComments))
                    }
                }
            ]
        };
    }
    else {
        throw new Error(`Unknown prompt: ${request.params.name}`);
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