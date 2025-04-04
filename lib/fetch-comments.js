import { parse } from 'node-html-parser';
import { decode } from 'html-entities';
import fetch from 'node-fetch';
/**
 * Get downvote count from comment element
 * @param commentTextDiv - HTML element containing comment
 * @returns Downvote count
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
 * @param postHtml - HTML content
 * @returns Map of comments
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
            if (!commentTextDiv)
                return '';
            // Remove unwanted HTML elements
            [...commentTextDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());
            // Replace <p> tags with their text content
            commentTextDiv.querySelectorAll('p').forEach(p => {
                const text = p.textContent;
                p.replaceWith(text);
            });
            // Remove unnecessary new lines and decode HTML entities
            const sanitizedText = decode(commentTextDiv.innerHTML)
                .replace(/\n+/g, ' ');
            return sanitizedText;
        }
        const commentText = sanitizeCommentText();
        // Get the down votes of the comment
        const downvotes = getDownvoteCount(commentTextDiv);
        const commentId = commentRow.getAttribute('id');
        if (commentId) {
            // Add the position, text and downvotes of the comment to the map
            commentsInDOM.set(Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            });
        }
    });
    // console.log(`Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);
    return commentsInDOM;
}
/**
 * Extract comments from the post and structure them
 * @param commentsTree - Comments tree from API
 * @param commentsInDOM - Comments map from DOM
 * @returns Map of structured comments
 */
export function extractComments(commentsTree, commentsInDOM) {
    // Merge the comments from the post hierarchy and DOM
    const flatComments = [];
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
        const commentInDOM = commentsInDOM.get(Number(comment.id));
        if (!commentInDOM) {
            // This comment is not found in the DOM comments because it was flagged or collapsed
            skippedComments++;
            return;
        }
        // Add comment to array along with its metadata
        flatComments.push({
            id: comment.id,
            path: '', // Will be calculated later
            author: comment.author,
            text: commentInDOM.text,
            score: 0, // Will be calculated later
            replies: comment.children?.length || 0,
            downvotes: commentInDOM.downvotes,
            parentId: parentId,
            position: commentInDOM.position
        });
        // Process children of the current comment
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                flattenCommentTree(child, comment.id);
            });
        }
    }
    // Flatten the comment tree and collect comments as an array
    flattenCommentTree(commentsTree, null);
    // console.log(`Comments from API:: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.length}`);
    // Sort comments by position
    flatComments.sort((a, b) => a.position - b.position);
    // Calculate paths (1.1, 2.3 etc.) using the parentId and the sequence of comments
    let topLevelCounter = 1;
    function calculatePath(comment) {
        let path;
        if (comment.parentId === commentsTree.id) {
            // Top level comment
            path = String(topLevelCounter++);
        }
        else {
            // Child comment at any level
            const parentComment = flatComments.find(c => c.id === comment.parentId);
            if (!parentComment) {
                throw new Error(`Parent comment not found for comment ${comment.id}`);
            }
            const parentPath = parentComment.path;
            // Get all the children of this comment's parents - this is the list of siblings
            const siblings = flatComments
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
        return Math.floor(Math.max(defaultScore - penalty, 0));
    }
    // Calculate paths and scores for all comments
    flatComments.forEach(comment => {
        comment.path = calculatePath(comment);
        comment.score = calculateScore(comment, flatComments.length);
    });
    return flatComments;
}
/**
 * Download post comments from Hacker News
 * @param postId - Post ID to download
 * @returns Post and comments data
 */
export async function downloadPostComments(postId) {
    // Fetch post data from HN API
    const postResponse = await fetch(`https://hn.algolia.com/api/v1/items/${postId}`);

    if (!postResponse.ok) {
        throw new Error(`Failed to fetch post: ${postResponse.statusText}`);
    }
    const postData = await postResponse.json();

    // Fetch post HTML to get comment structure
    const postHtmlResponse = await fetch(`https://news.ycombinator.com/item?id=${postId}`);
    if (!postHtmlResponse.ok) {
        throw new Error(`Failed to fetch post HTML: ${postHtmlResponse.statusText}`);
    }
    const postHtml = await postHtmlResponse.text();

    // Get comments from DOM
    const commentsInDOM = await getCommentsFromDOM(postHtml);

    // Convert HNPostData to CommentTree and extract comments
    const postComments = extractComments(postData, commentsInDOM);
    return {
        post: {
            id: postId,
            title: postData.title
        },
        postComments
    };
}