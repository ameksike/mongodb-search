/**
 * Minimal full-text search demo. Uses Atlas Search $search stage.
 * Requires an Atlas Search (full-text) index on the collection.
 * Config: .env → MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, SEARCH_INDEX_NAME, SEARCH_QUERY, SEARCH_PATH
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

// Config from environment variables
const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'films',
    SEARCH_INDEX_NAME = 'title_description_index',
    SEARCH_QUERY = 'Good',
    SEARCH_PATH = 'title,description',
} = process.env;

// Validate required config
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');

// Determine search path(s) - supports comma-separated list for multiple fields
const path = SEARCH_PATH.includes(',') ? SEARCH_PATH.split(',').map((p) => p.trim()) : SEARCH_PATH;

// Connect to MongoDB
const client = new MongoClient(MONGODB_URI);
await client.connect();

// Get collection
const coll = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);

// List existing search indexes for the collection
const searchIndexes = await coll.listSearchIndexes().toArray();
console.log("Existing Search Indexes:", JSON.stringify(searchIndexes.map(index => ({
    name: index.name,
    type: index.type,
    fields: index.latestDefinition?.mappings?.fields || index.latestDefinition?.fields || "dynamic"
})), null, 2));

// Create a search index if it doesn't exist
if (!searchIndexes.some(index => index.name === SEARCH_INDEX_NAME)) {
    await coll.createSearchIndex({
        name: SEARCH_INDEX_NAME,
        definition: {
            mappings: {
                fields: {
                    title: { type: "autocomplete" },
                    description: { type: "string" },
                },
            },
        }
    });
}

// Basic text search using a standard text index (not Atlas Search) for comparison
console.log("Basic text search:", await coll.find(
    { title: "The Shawshank Redemption" },
    { projection: { _id: 0, title: 1, description: 1 } }
).toArray());

// Basic text search with filters (e.g., movies released from 2000 or later in Action or Adventure genres)
console.log("Basic text search with filters:", await coll.find(
    { title: { $in: ["The Shawshank Redemption", "The Dark Knight"] } },
    { projection: { _id: 0, title: 1, description: 1 } }
).toArray());

// Basic text search with regex filter (e.g., titles starting with "Good", case-insensitive)
console.log("Basic text search with regex filter:", await coll.find(
    {
        title: {
            $regex: "^Good",
            $options: "i"
        },
    },
    { projection: { _id: 0, title: 1, description: 1 } }
).toArray());

// Text Search: Matches documents containing the word "Good" or related tokens in specified fields
console.log("Text Search Results:", await coll.aggregate([
    {
        $search: {
            index: SEARCH_INDEX_NAME,
            text: {
                query: SEARCH_QUERY, // Value to match in text fields
                path: Array.isArray(path) ? path : ["title", "description"], // Fields where search will be performed
            },
        },
    },
    { $limit: 5 },
    { $project: { _id: 0, title: 1, description: 1, score: { $meta: "searchScore" } } },
]).toArray());

// Phrase Search: Matches documents containing the exact phrase "witnesses supernatural events" in specified fields
console.log("Phrase Search Results:", await coll.aggregate([
    {
        $search: {
            index: SEARCH_INDEX_NAME,
            phrase: {
                query: "witnesses supernatural events", // Exact phrase to match
                path: "description", // Field where search will be performed
            },
        },
    },
    { $limit: 5 },
    { $project: { _id: 0, title: 1, description: 1, score: { $meta: "searchScore" } } },
]).toArray());

// Wildcard Search: Matches documents whose description contains any words starting with "Good"
console.log("Wildcard Search Results:", await coll.aggregate([
    {
        $search: {
            index: SEARCH_INDEX_NAME,
            wildcard: {
                query: SEARCH_QUERY + "*", // Wildcard pattern: matches words starting with "Good"
                path: "description", // Field where wildcard search will be performed
                allowAnalyzedField: true // Allows matching against analyzed fields, enabling tokenization and stemming for better search results
            },
        },
    },
    { $limit: 5 },
    { $project: { _id: 0, title: 1, description: 1, score: { $meta: "searchScore" } } },
]).toArray());

// Autocomplete Search: Matches documents whose title field starts with the word "Good"
console.log("Autocomplete Search Results:", await coll.aggregate([
    {
        $search: {
            index: SEARCH_INDEX_NAME,
            autocomplete: {
                query: SEARCH_QUERY, // Prefix to match
                path: "title", // Field where autocomplete will be performed
            },
        },
    },
    { $limit: 5 },
    { $project: { _id: 0, title: 1, description: 1, score: { $meta: "searchScore" } } },
]).toArray());

// Close connection
await client.close();
