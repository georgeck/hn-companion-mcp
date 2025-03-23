/**
 * Extract post ID from a Hacker News URL
 *
 * @param {string} url - The Hacker News URL
 * @returns {string|null} The post ID or null if not found
 */
export function extractPostIdFromUrl(url) {
    try {
        const hnUrlPattern = /news\.ycombinator\.com\/item\?id=(\d+)/;
        const match = url.match(hnUrlPattern);

        if (match && match[1]) {
            return match[1];
        }

        return null;
    } catch (error) {
        console.error('Error extracting post ID from URL:', error);
        return null;
    }
}

/**
 * Get the downvote count from a comment's text div
 * Based on the CSS class that indicates downvotes
 *
 * @param {Object} commentTextDiv - The comment text div element
 * @returns {number} The number of downvotes
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
