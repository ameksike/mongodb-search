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

// Assumed dependencies:
// const products = db.collection("products");
// async function embedQuery(text) { ... }
const productSearch = {
    // Autocomplete search for product names and brands.
    async autocomplete(query, limit = 8) {
        const q = query.trim();
        if (!q) return [];

        return products.aggregate([
            {
                $search: {
                    index: "product_autocomplete",
                    compound: {
                        should: [
                            {
                                autocomplete: {
                                    query: q,
                                    path: "name",
                                    tokenOrder: "sequential"
                                }
                            },
                            {
                                autocomplete: {
                                    query: q,
                                    path: "brand",
                                    tokenOrder: "sequential"
                                }
                            }
                        ],
                        minimumShouldMatch: 1
                    }
                }
            },
            { $limit: limit },
            {
                $project: {
                    name: 1,
                    brand: 1,
                    price: 1
                }
            }
        ]).toArray();
    },

    // Exact search for product codes (SKU or GTIN).
    async exact(code) {
        const normalizedCode = code
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");

        if (!normalizedCode) return [];

        return products.find({
            $or: [
                { skuNormalized: normalizedCode },
                { gtinNormalized: normalizedCode }
            ]
        }).limit(10).toArray();
    },

    // Full-text search for product names, brands, and descriptions.
    async text(query, limit = 20) {
        const q = query.trim();
        if (!q) return [];

        return products.aggregate([
            {
                $search: {
                    index: "products_text",
                    text: {
                        query: q,
                        path: ["name", "brand", "description"]
                    }
                }
            },
            { $limit: limit },
            {
                $project: {
                    name: 1,
                    brand: 1,
                    price: 1,
                    score: { $meta: "searchScore" }
                }
            }
        ]).toArray();
    },

    // Hybrid search combining full-text and vector search for product names, brands, and descriptions.
    async hybrid(query, limit = 10) {
        const q = query.trim();
        if (!q) return [];

        const queryVector = await embedQuery(q);
        const candidateLimit = 30;

        return products.aggregate([
            {
                $rankFusion: {
                    input: {
                        pipelines: {
                            lexical: [
                                {
                                    $search: {
                                        index: "products_text",
                                        text: {
                                            query: q,
                                            path: ["name", "brand", "description"]
                                        }
                                    }
                                },
                                { $limit: candidateLimit }
                            ],
                            semantic: [
                                {
                                    $vectorSearch: {
                                        index: "products_vector",
                                        path: "embedding",
                                        queryVector,
                                        exact: false,
                                        numCandidates: 300,
                                        limit: candidateLimit
                                    }
                                }
                            ]
                        }
                    },
                    combination: {
                        weights: {
                            lexical: 0.7,
                            semantic: 0.3
                        }
                    }
                }
            },
            { $limit: limit },
            {
                $project: {
                    name: 1,
                    brand: 1,
                    price: 1,
                    score: { $meta: "score" }
                }
            }
        ]).toArray();
    }
};

// While the user is typing: autocomplete suggestions
const suggestions = await searchProducts(searchInput.value, {
    submitted: false,
    search: productSearch
});

// When the search is submitted: full search results
const results = await searchProducts(searchInput.value, {
    submitted: true,
    search: productSearch
});
