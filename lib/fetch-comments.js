import fetch from 'node-fetch';
import {parse} from 'node-html-parser';
import {decode} from 'html-entities';

/**
 * Fetch post data from Hacker News API
 * @param {string} postId - HN post ID
 * @returns {Promise<Object>} - Post data
 */
export async function fetchHNPostFromAPI(postId) {
    try {
        const url = `https://hn.algolia.com/api/v1/items/${postId}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        throw new Error(`Failed to fetch post from HN API for post ID ${postId}. Error: ${error.message}`);
    }
}

/**
 * Fetch post HTML from Hacker News website
 * @param {string} postId - HN post ID
 * @returns {Promise<string>} - HTML content
 */
export async function fetchHNPage(postId) {
    try {
        const url = `https://news.ycombinator.com/item?id=${postId}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        const responseText = await response.text();

        // If the post id is not found, the response will be "No such item."
        if (responseText === 'No such item.') {
            throw new Error(`Post ID ${postId} not found on HN.`);
        }

        return responseText;
    } catch (error) {
        throw new Error(`Failed to fetch HN page for post ID ${postId}: ${error.message}`);
    }
}

/**
 * Get downvote count from comment element
 * @param {Object} commentTextDiv - HTML element containing comment
 * @returns {number} - Downvote count
 */
export function getDownvoteCount(commentTextDiv) {
    // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
    const downvotePattern = /c[0-9a-f]{2}/;

    // Find the first class that matches the downvote pattern
    const downvoteClass = [...commentTextDiv.classList.values()]
        .find(className => downvotePattern.test(className.toLowerCase()))
        ?.toLowerCase();

    if (!downvoteClass) {
        return 0;
    }

    const downvoteMap = {
        'c00': 0,
        'c5a': 1,
        'c73': 2,
        'c82': 3,
        'c88': 4,
        'c9c': 5,
        'cae': 6,
        'cbe': 7,
        'cce': 8,
        'cdd': 9
    };
    return downvoteMap[downvoteClass] || 0;
}

/**
 * Extract comments from HTML
 * @param {string} postHtml - HTML content
 * @returns {Map} - Map of comments
 */
export async function getCommentsFromDOM(postHtml) {
    // Comments in the DOM are arranged according to their up votes
    const commentsInDOM = new Map();
    const rootElement = parse(postHtml);
    const commentRows = rootElement.querySelectorAll('.comtr');

    let skippedComments = 0;
    commentRows.forEach((commentRow, index) => {
        // If comment is flagged, it will have the class "coll" (collapsed) or "noshow" (children of collapsed comments)
        const commentFlagged = commentRow.classList.contains('coll') || commentRow.classList.contains('noshow');
        const commentTextDiv = commentRow.querySelector('.commtext');
        if (commentFlagged || !commentTextDiv) {
            skippedComments++;
            return;
        }

        // Sanitize the comment text
        function sanitizeCommentText() {
            // Remove unwanted HTML elements
            [...commentTextDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());

            // Replace <p> tags with their text content
            commentTextDiv.querySelectorAll('p').forEach(p => {
                const text = p.textContent;
                p.replaceWith(text);
            });

            // Remove unnecessary new lines and decode HTML entities
            const sanitizedText = decode(commentTextDiv.innerHTML)
                .replace(/\\n+/g, ' ');

            return sanitizedText;
        }

        const commentText = sanitizeCommentText();

        // Get the down votes of the comment
        const downvotes = getDownvoteCount(commentTextDiv);
        const commentId = commentRow.getAttribute('id');

        // Add the position, text and downvotes of the comment to the map
        commentsInDOM.set(
            Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            }
        );
    });

    console.log(`Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);
    return commentsInDOM;
}

/**
 * Extract comments from the post and structure them
 * @param {Object} commentsTree - Comments tree from API
 * @param {Map} commentsInDOM - Comments map from DOM
 * @returns {Map} - Structured comments
 */
export function extractComments(commentsTree, commentsInDOM) {
    // Merge the comments from the post hierarchy and DOM
    let flatComments = new Map();
    let apiComments = 0;
    let skippedComments = 0;

    function flattenCommentTree(comment, parentId) {
        // Track the number of comments as we traverse the tree
        apiComments++;

        // If this is the story item (root of the tree), flatten its children, but do not add the story item to the map
        if (comment.type === 'story') {
            if (comment.children && comment.children.length > 0) {
                comment.children.forEach(child => {
                    flattenCommentTree(child, comment.id);
                });
            }
            return;
        }

        // Get the DOM comment corresponding to this comment
        const commentInDOM = commentsInDOM.get(comment.id);
        if (!commentInDOM) {
            // This comment is not found in the DOM comments because it was flagged or collapsed
            skippedComments++;
            return;
        }

        // Add comment to map along with its metadata
        flatComments.set(comment.id, {
            id: comment.id,
            author: comment.author,
            replies: comment.children?.length || 0,
            position: commentInDOM.position,
            text: commentInDOM.text,
            downvotes: commentInDOM.downvotes,
            parentId: parentId,
        });

        // Process children of the current comment
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                flattenCommentTree(child, comment.id);
            });
        }
    }

    // Flatten the comment tree and collect comments as a map
    flattenCommentTree(commentsTree, null);
    console.log(`Comments from API:: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`);

    // Sort comments by position
    const mergedComments = new Map([...flatComments.entries()]
        .sort((a, b) => a[1].position - b[1].position));

    // Calculate paths (1.1, 2.3 etc.) using the parentId and the sequence of comments
    let topLevelCounter = 1;

    function calculatePath(comment) {
        let path;
        if (comment.parentId === commentsTree.id) {
            // Top level comment
            path = String(topLevelCounter++);
        } else {
            // Child comment at any level
            const parentPath = mergedComments.get(comment.parentId).path;

            // Get all the children of this comment's parents - this is the list of siblings
            const siblings = [...mergedComments.values()]
                .filter(c => c.parentId === comment.parentId);

            // Find the position of this comment in the siblings list
            const positionInParent = siblings
                .findIndex(c => c.id === comment.id) + 1;

            // Set the path as the parent's path + the position in the parent's children list
            path = `${parentPath}.${positionInParent}`;
        }
        return path;
    }

    // Calculate the score for each comment based on its position and downvotes
    function calculateScore(comment, totalCommentCount) {
        const downvotes = comment.downvotes || 0;

        const MAX_SCORE = 1000;
        const MAX_DOWNVOTES = 10;

        const defaultScore = Math.floor(MAX_SCORE - (comment.position * MAX_SCORE / totalCommentCount));
        const penaltyPerDownvote = defaultScore / MAX_DOWNVOTES;
        const penalty = penaltyPerDownvote * downvotes;

        const score = Math.floor(Math.max(defaultScore - penalty, 0));
        return score;
    }

    // Add the path and score for each comment
    mergedComments.forEach(comment => {
        comment.path = calculatePath(comment);
        comment.score = calculateScore(comment, mergedComments.size);

        // Format the comment with path, score, replies, downvotes, author and text
        comment.formattedText =
            `[${comment.path}] (score: ${comment.score}) <replies: ${comment.replies}> {downvotes: ${comment.downvotes}} ` +
            `${comment.author}: ${comment.text}`;
    });

    return mergedComments;
}

/**
 * Download and process post comments
 * @param {string} postId - HN post ID
 * @returns {Promise<Object>} - Post and comments data
 */
export async function downloadPostComments(postId) {
    try {
        console.log(`...Downloading comments from HN Algolia and merging it with the DOM page`);
        // Fetch both data sources in parallel to improve performance
        const [post, postHtml] = await Promise.all([
            fetchHNPostFromAPI(postId),
            fetchHNPage(postId)
        ]);

        const commentsInDOM = await getCommentsFromDOM(postHtml);

        // Merge the two data sets to structure the comments
        const postComments = extractComments(post, commentsInDOM);

        // Return structured data
        return {
            post,
            postComments
        };
    } catch (error) {
        console.error(`...Error downloading comments: ${error.message}`);
        throw error;
    }
}
