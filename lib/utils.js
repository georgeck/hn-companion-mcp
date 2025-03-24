/**
 * Utility functions for the HN Companion MCP
 */
/**
 * Extract a post ID from a Hacker News URL
 * @param url - HN URL (e.g., https://news.ycombinator.com/item?id=43448075)
 * @returns The post ID or null if not found
 */
export function extractPostIdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'news.ycombinator.com' || urlObj.hostname === 'hn.algolia.com') {
            const params = new URLSearchParams(urlObj.search);
            return params.get('id');
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
/**
 * Check if a string is a valid post ID
 * @param id - Post ID to validate
 * @returns True if the ID is valid
 */
function isValidPostId(id) {
    return /^\d+$/.test(id);
}
/**
 * Get post ID from either a URL or direct ID
 * @param input - URL or post ID
 * @returns Extracted post ID or null if invalid
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
//# sourceMappingURL=utils.js.map