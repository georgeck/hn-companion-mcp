import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { decode } from 'html-entities';
import { getDownvoteCount } from './utils.js';

/**
 * Fetch post data from Hacker News API and DOM
 * 
 * @param {string} postId - The Hacker News post ID
 * @returns {Object} The post data and formatted comments
 */
export async function getPostData(postId) {
  try {
    console.log(`Downloading comments from HN Algolia and merging with DOM page for post ID: ${postId}`);
    
    // Fetch both data sources in parallel
    const [post, postHtml] = await Promise.all([
      fetchHNPostFromAPI(postId),
      fetchHNPage(postId)
    ]);
    
    // Extract comments from DOM
    const commentsInDOM = await getCommentsFromDOM(postHtml);
    
    // Merge API and DOM data
    const postComments = extractComments(post, commentsInDOM);
    
    return {
      post,
      comments: postComments
    };
  } catch (error) {
    console.error(`Error downloading post data for post ID ${postId}:`, error);
    throw error;
  }
}

/**
 * Fetch post data from Hacker News Algolia API
 * 
 * @param {string} postId - The Hacker News post ID
 * @returns {Object} The post data from the API
 */
async function fetchHNPostFromAPI(postId) {
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
 * Fetch the Hacker News page HTML
 * 
 * @param {string} postId - The Hacker News post ID
 * @returns {string} The HTML content of the page
 */
async function fetchHNPage(postId) {
  try {
    const url = `https://news.ycombinator.com/item?id=${postId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }
    
    const responseText = await response.text();
    
    // Check if post exists
    if (responseText === 'No such item.') {
      throw new Error(`Post ID ${postId} not found on HN.`);
    }
    
    return responseText;
  } catch (error) {
    throw new Error(`Failed to fetch HN page for post ID ${postId}: ${error.message}`);
  }
}

/**
 * Extract comments from the page DOM
 * 
 * @param {string} postHtml - The HTML content of the page
 * @returns {Map} A map of comments by ID with position and text
 */
async function getCommentsFromDOM(postHtml) {
  // Create a map to store comment positions, downvotes and text
  const commentsInDOM = new Map();
  
  const rootElement = parse(postHtml);
  
  // Collect all comments and their metadata
  const commentRows = rootElement.querySelectorAll('.comtr');
  
  let skippedComments = 0;
  commentRows.forEach((commentRow, index) => {
    // Check if comment is flagged or deleted
    const commentFlagged = commentRow.classList.contains('coll') || commentRow.classList.contains('noshow');
    const commentTextDiv = commentRow.querySelector('.commtext');
    
    if (commentFlagged || !commentTextDiv) {
      skippedComments++;
      return;
    }
    
    // Sanitize comment text
    function sanitizeCommentText() {
      // Clone the node to avoid modifying the original
      const clone = commentTextDiv.cloneNode(true);
      
      // Remove unwanted HTML elements
      clone.querySelectorAll('a, code, pre').forEach(element => element.remove());
      
      // Replace <p> tags with their text content
      clone.querySelectorAll('p').forEach(p => {
        const text = p.textContent;
        p.replaceWith(text);
      });
      
      // Remove unnecessary new lines and decode HTML entities
      const sanitizedText = decode(clone.innerHTML)
        .replace(/\n+/g, ' ');
      
      return sanitizedText;
    }
    
    const commentText = sanitizeCommentText();
    const downvotes = getDownvoteCount(commentTextDiv);
    const commentId = commentRow.getAttribute('id');
    
    // Add comment to DOM map
    commentsInDOM.set(
      Number(commentId), {
        position: index,
        text: commentText,
        downvotes: downvotes,
      }
    );
  });
  
  console.log(`Comments from DOM: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);
  return commentsInDOM;
}

/**
 * Extract and format comments by combining API and DOM data
 * 
 * @param {Object} commentsTree - The comments tree from the API
 * @param {Map} commentsInDOM - The comments map from the DOM
 * @returns {Map} A map of formatted comments
 */
export function extractComments(commentsTree, commentsInDOM) {
  // Flatten the comment tree and add metadata
  let flatComments = new Map();
  let apiComments = 0;
  let skippedComments = 0;
  
  function flattenCommentTree(comment, parentId) {
    // Track comments from HN API
    apiComments++;
    
    // Skip story item (root)
    if (comment.type === 'story') {
      if (comment.children && comment.children.length > 0) {
        comment.children.forEach(child => {
          flattenCommentTree(child, comment.id);
        });
      }
      return;
    }
    
    // Get corresponding DOM comment
    const commentInDOM = commentsInDOM.get(comment.id);
    if (!commentInDOM) {
      // Skip flagged or collapsed comments
      skippedComments++;
      return;
    }
    
    // Add comment to flat map with metadata
    flatComments.set(comment.id, {
      id: comment.id,
      author: comment.author,
      replies: comment.children?.length || 0,
      position: commentInDOM.position,
      text: commentInDOM.text,
      downvotes: commentInDOM.downvotes,
      parentId: parentId,
    });
    
    // Process children
    if (comment.children && comment.children.length > 0) {
      comment.children.forEach(child => {
        flattenCommentTree(child, comment.id);
      });
    }
  }
  
  // Flatten comment tree
  flattenCommentTree(commentsTree, null);
  console.log(`Comments from API: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`);
  
  // Sort comments by position
  const mergedComments = new Map([...flatComments.entries()]
    .sort((a, b) => a[1].position - b[1].position));
  
  // Calculate paths for each comment
  let topLevelCounter = 1;
  
  function calculatePath(comment) {
    let path;
    if (comment.parentId === commentsTree.id) {
      // Top level comment
      path = String(topLevelCounter++);
    } else {
      // Child comment
      const parentPath = mergedComments.get(comment.parentId).path;
      
      // Get siblings
      const siblings = [...mergedComments.values()]
        .filter(c => c.parentId === comment.parentId);
      
      // Find position in siblings
      const positionInParent = siblings
        .findIndex(c => c.id === comment.id) + 1;
      
      // Set path
      path = `${parentPath}.${positionInParent}`;
    }
    return path;
  }
  
  // Calculate score for each comment
  function calculateScore(comment, totalCommentCount) {
    const downvotes = comment.downvotes || 0;
    
    // Score calculation: higher position = higher score, penalty for downvotes
    const MAX_SCORE = 1000;
    const MAX_DOWNVOTES = 10;
    
    const defaultScore = Math.floor(MAX_SCORE - (comment.position * MAX_SCORE / totalCommentCount));
    const penaltyPerDownvote = defaultScore / MAX_DOWNVOTES;
    const penalty = penaltyPerDownvote * downvotes;
    
    return Math.floor(Math.max(defaultScore - penalty, 0));
  }
  
  // Add path and score to each comment
  mergedComments.forEach(comment => {
    comment.path = calculatePath(comment);
    comment.score = calculateScore(comment, mergedComments.size);
    
    // Format the comment text
    comment.formattedText =
      `[${comment.path}] (score: ${comment.score}) <replies: ${comment.replies}> {downvotes: ${comment.downvotes}} ` +
      `${comment.author}: ${comment.text}`;
  });
  
  return mergedComments;
}
