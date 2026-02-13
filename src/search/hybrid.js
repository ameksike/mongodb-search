/**
 * Minimal hybrid search demo: runs full-text and vector search, then merges top results.
 * Config: .env → MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, SEARCH_INDEX_NAME, SEARCH_QUERY, SEARCH_PATH,
 *         VECTOR_INDEX_NAME, VECTOR_INDEX_PATH, VECTOR_DIMENSIONS
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
    VECTOR_INDEX_NAME = 'rag_vector_text_index',
    VECTOR_INDEX_PATH = 'embedding.text',
    VECTOR_DIMENSIONS = '1024',
} = process.env;

// Validate required config
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');

// define dimensions and query vector before connecting to MongoDB since they don't depend on the connection
const dimensions = Number(VECTOR_DIMENSIONS);

// Create zero vector query (replace with real embedding vector for actual use)
const queryVector = Array(dimensions).fill(0);

// Parse search paths
const path = SEARCH_PATH.includes(',') ? SEARCH_PATH.split(',').map((p) => p.trim()) : SEARCH_PATH;

// Connect to MongoDB
const client = new MongoClient(MONGODB_URI);
await client.connect();

// Get collection
const coll = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);

// Run full-text and vector search in parallel, then merge results
const [textDocs, vectorDocs] = await Promise.all([
    coll
        .aggregate([
            { $search: { index: SEARCH_INDEX_NAME, text: { query: SEARCH_QUERY, path } } },
            { $limit: 3 },
            { $project: { title: 1, description: 1, score: { $meta: 'searchScore' }, _source: 'text' } },
        ])
        .toArray(),
    coll
        .aggregate([
            {
                $vectorSearch: {
                    index: VECTOR_INDEX_NAME,
                    path: VECTOR_INDEX_PATH,
                    queryVector,
                    numCandidates: 30,
                    limit: 3,
                },
            },
            { $project: { title: 1, description: 1, score: { $meta: 'vectorSearchScore' }, _source: 'vector' } },
        ])
        .toArray(),
]);

// Merge results, deduplicating by _id (assuming text and vector results may overlap)
const seen = new Set();
const merged = [];
for (const d of [...textDocs, ...vectorDocs]) {
    if (seen.has(d._id.toString())) continue;
    seen.add(d._id.toString());
    const { _source, ...rest } = d;
    merged.push(rest);
}

// Output merged results
console.log(JSON.stringify({
    textCount: textDocs.length,
    vectorCount: vectorDocs.length,
    merged: merged.length,
    results: merged
}, null, 2));

// close connection
await client.close();
