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
    SEARCH_INDEX_NAME = 'default',
    SEARCH_QUERY = 'hero',
    SEARCH_PATH = 'title,description',
} = process.env;

// Validate required config
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');

// Connect to MongoDB
const client = new MongoClient(MONGODB_URI);
await client.connect();

// Get collection
const coll = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);

// Build aggregation pipeline with $search stage
const path = SEARCH_PATH.includes(',') ? SEARCH_PATH.split(',').map((p) => p.trim()) : SEARCH_PATH;

// $search stage with text operator
const pipeline = [
    {
        $search: {
            index: SEARCH_INDEX_NAME,
            text: { query: SEARCH_QUERY, path },
        },
    },
    { $limit: 5 },
    { $project: { title: 1, description: 1, score: { $meta: 'searchScore' } } },
];

// Execute aggregation
const docs = await coll.aggregate(pipeline).toArray();

// Output results
console.log(JSON.stringify({
    query: SEARCH_QUERY,
    count: docs.length,
    results: docs
}, null, 2));

// Close connection
await client.close();
