// Regular expression patterns for identifying product codes. GTIN (Global Trade Item Number) and SKU (Stock Keeping Unit) are supported.
const GTIN_RE = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;

// Example only: adapt this pattern to your store's SKU format.
const SKU_RE = /^SKU-[A-Z0-9-]+$/i;

// Keywords that indicate a descriptive product query.
const DESCRIPTION_CUE = /\b(for|with|without|ideal|suitable)\b/i;

/**
 * Chooses the appropriate search strategy based on the query and submission status.
 * @param {string} query The search query entered by the user.
 * @param {Object} param1 Options object.
 * @param {boolean} param1.submitted Indicates if the search was submitted.
 * @returns {Object} An object describing the chosen search strategy and the normalized query.
 */
function chooseSearch(query, { submitted = false } = {}) {
    const q = query.trim();

    if (!q) return { type: "none", query: q };

    // While the customer is typing, use fast prefix autocomplete.
    if (!submitted) {
        return {
            type: q.length >= 2 ? "autocomplete" : "none",
            query: q
        };
    }

    // Search normalized SKU or GTIN fields for exact matches.
    const compactQuery = q.replace(/[\s-]/g, "");
    if (GTIN_RE.test(compactQuery) || SKU_RE.test(q)) {
        return { type: "exact", query: q };
    }

    // Initial heuristic for descriptive queries; tune with real search data.
    const wordCount = q.split(/\s+/).length;
    if ((wordCount >= 4 && DESCRIPTION_CUE.test(q)) || wordCount >= 6) {
        return { type: "hybrid", query: q };
    }

    return { type: "text", query: q };
}


/**
 * Performs a product search using the chosen search strategy.
 * @param {string} query The search query entered by the user.
 * @param {Object} param1 Options object.
 * @param {boolean} param1.submitted Indicates if the search was submitted.
 * @param {Object} param1.search The search implementation with exact, text, hybrid, and autocomplete methods.
 * @returns {Promise<Array>} A promise that resolves to an array of search results.
 */
async function searchProducts(
    query,
    { submitted = false, search } = {}
) {
    const route = chooseSearch(query, { submitted });

    if (route.type === "none") return [];

    if (route.type === "exact") {
        const results = await search.exact(route.query);

        // If no exact product code matches, fall back to text search.
        return results.length
            ? results
            : search.text(route.query, { limit: 20 });
    }

    const limit = route.type === "autocomplete" ? 8 : 20;
    return search[route.type](route.query, { limit });
}
