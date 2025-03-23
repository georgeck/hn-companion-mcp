/**
 * Utility functions for the HN Companion MCP
 */

/**
 * Extract a post ID from a Hacker News URL
 * @param {string} url - HN URL (e.g., https://news.ycombinator.com/item?id=43448075)
 * @returns {string|null} - The post ID or null if not found
 */
export function extractPostIdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'news.ycombinator.com' || urlObj.hostname === 'hn.algolia.com') {
            const params = new URLSearchParams(urlObj.search);
            return params.get('id');
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Validates if a string is a valid post ID
 * @param {string} postId - The post ID to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidPostId(postId) {
    return /^\d+$/.test(postId);
}

/**
 * Get post ID from either a URL or direct ID
 * @param {string} input - URL or post ID
 * @returns {string|null} - Extracted post ID or null if invalid
 */
export function getPostId(input) {
    // Check if input is a URL
    if (input.startsWith('http')) {
        return extractPostIdFromUrl(input);
    }

    // Check if input is a valid post ID
    if (isValidPostId(input)) {
        return input;
    }

    return null;
}
