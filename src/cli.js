#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {getPostData} from './hn-fetcher.js';
import {generateSystemPrompt, generateUserPrompt} from './prompt-generator.js';
import {extractPostIdFromUrl} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
}

/**
 * Create a path-to-id mapping for comments to help resolve links
 *
 * @param {Object} post - The post data
 * @param {Map} comments - The formatted comments map
 * @returns {Object} The mapping files information
 */
function createCommentPathIdMapping(post, comments) {
    // Create an array of [path, id] pairs
    const commentPathIdMapping = [];
    comments.forEach(comment => {
        commentPathIdMapping.push([comment.path, comment.id]);
    });

    // Save to file
    const commentPathMapFilePath = path.join(outputDir, `${post.id}-comment-path-id-map.json`);
    fs.writeFileSync(commentPathMapFilePath, JSON.stringify(commentPathIdMapping, null, 2), 'utf8');
    console.log(`Saved ${comments.size} comment paths map to ${commentPathMapFilePath}`);

    return {commentPathIdMapping, commentPathMapFilePath};
}

/**
 * Save prompts to files
 *
 * @param {Object} post - The post data
 * @param {string} systemPrompt - The system prompt
 * @param {string} userPrompt - The user prompt
 */
function savePromptsToFiles(post, systemPrompt, userPrompt) {
    // Save system prompt
    const systemPromptFilePath = path.join(outputDir, `${post.id}-system-prompt.txt`);
    fs.writeFileSync(systemPromptFilePath, systemPrompt, 'utf8');
    console.log(`Saved system prompt to ${systemPromptFilePath}`);

    // Save user prompt
    const userPromptFilePath = path.join(outputDir, `${post.id}-user-prompt.txt`);
    fs.writeFileSync(userPromptFilePath, userPrompt, 'utf8');
    console.log(`Saved user prompt to ${userPromptFilePath}`);
}

/**
 * Process a Hacker News post
 *
 * @param {string} input - Either a post ID or URL
 */
async function processPost(input) {
    try {
        // Determine if input is a URL or post ID
        let postId;
        if (input.startsWith('http')) {
            postId = extractPostIdFromUrl(input);
            if (!postId) {
                console.error('Invalid Hacker News URL');
                process.exit(1);
            }
        } else {
            postId = input;
        }

        console.log(`Processing Hacker News post ID: ${postId}`);

        // Fetch post data
        const {post, comments} = await getPostData(postId);
        console.log(`Downloaded post "${post.title}" with ${comments.size} comments`);

        // Create comment path-to-id mapping
        createCommentPathIdMapping(post, comments);

        // Generate prompts
        const systemPrompt = generateSystemPrompt();
        const userPrompt = generateUserPrompt(post, comments);

        // Save prompts to files
        savePromptsToFiles(post, systemPrompt, userPrompt);

        console.log('\nPost processed successfully!');
        console.log(`You can use the generated prompts to summarize the post "${post.title}"`);

    } catch (error) {
        console.error('Error processing post:', error);
        process.exit(1);
    }
}

// Check if a post ID or URL was provided
if (process.argv.length < 3) {
    console.error('Please provide a Hacker News post ID or URL');
    console.log('Usage: node cli.js <postId or URL>');
    process.exit(1);
}

// Get the post ID or URL from the command line
const input = process.argv[2];
processPost(input);
