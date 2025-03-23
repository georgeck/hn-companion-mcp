#!/usr/bin/env node

import {getPostId} from './lib/utils.js';
import {downloadPostComments} from './lib/fetch-comments.js';
import {formatForClaude} from './lib/format-prompt.js';

// Get input from command line arguments
const input = process.argv[2];

async function main() {
    try {
        if (!input) {
            console.error('Please provide a Hacker News post ID or URL');
            process.exit(1);
        }

        const postId = getPostId(input);

        if (!postId) {
            console.error('Invalid input. Please provide a valid Hacker News post ID or URL');
            process.exit(1);
        }

        console.log(`Processing Hacker News post ID: ${postId}`);

        // Download and process comments
        const {post, postComments} = await downloadPostComments(postId);

        console.log(`Downloaded post "${post.title}" with ${postComments.size} comments`);

        // Format data for Claude
        const formattedData = formatForClaude(post, postComments);

        // Output the formatted data
        console.log('Formatted data for Claude:');
        console.log(JSON.stringify(formattedData, null, 2));

        console.log('\nTo use this data with Claude, pass the systemPrompt and userPrompt values to Claude.');
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
