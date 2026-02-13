/**
 * Minimal vector search demo. Uses Atlas Vector Search $vectorSearch stage.
 * Config: .env → MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, VECTOR_INDEX_NAME, VECTOR_INDEX_PATH, VECTOR_DIMENSIONS
 * Uses a zero vector as query for demo (replace with real embedding for real similarity).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

// Config from environment variables
const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'films',
    VECTOR_INDEX_NAME = 'rag_vector_text_index',
    VECTOR_INDEX_PATH = 'embedding.text',
    VECTOR_DIMENSIONS = '1024',
} = process.env;

// Validate required config
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');

// Create zero vector query (replace with real embedding vector for actual use)
const dimensions = Number(VECTOR_DIMENSIONS);
const queryVector = Array(dimensions).fill(0);

// Connect to MongoDB
const client = new MongoClient(MONGODB_URI);
await client.connect();

// Get collection
const coll = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);

// Build aggregation pipeline with $vectorSearch stage
const pipeline = [
    {
        $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: VECTOR_INDEX_PATH,
            queryVector,
            numCandidates: 50,
            limit: 5,
        },
    },
    { $project: { title: 1, description: 1, score: { $meta: 'vectorSearchScore' } } },
];

// Execute aggregation
const docs = await coll.aggregate(pipeline).toArray();

// Output results
console.log(JSON.stringify({
    index: VECTOR_INDEX_NAME,
    count: docs.length,
    results: docs
}, null, 2));

// close connection
await client.close();
