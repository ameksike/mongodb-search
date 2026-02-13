/**
 * Minimal vector search demo. Uses VoyageAIService to embed the query, then Atlas Vector Search $vectorSearch.
 * Config: .env → MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, VECTOR_INDEX_NAME, VECTOR_INDEX_PATH, VOYAGE_API_URL, VOYAGE_API_KEY, VOYAGE_MODEL, SEARCH_QUERY
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { VoyageAIService } from '../agent/services/VoyageAIService.js';

// Config and constants. Adjust these as needed for your environment and use case.
const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'films',
    VECTOR_INDEX_NAME = 'rag_vector_text_index',
    VECTOR_INDEX_PATH = 'embedding.text',
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
    SEARCH_QUERY = 'a hero fighting in ancient Rome',
} = process.env;

// Basic config validation. In a real app, you'd want more robust validation and error handling.
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');
if (!VOYAGE_API_URL || !VOYAGE_API_KEY || !VOYAGE_MODEL) throw new Error('Missing VoyageAI config (VOYAGE_API_URL, VOYAGE_API_KEY, VOYAGE_MODEL)');

// Get the query embedding from VoyageAIService
const voyage = new VoyageAIService({ apiUrl: VOYAGE_API_URL, apiKey: VOYAGE_API_KEY, model: VOYAGE_MODEL });

// In a real app, you'd want to cache the query embedding for repeated queries, and handle errors/retries.
const queryVector = await voyage.getEmbedding(SEARCH_QUERY);

// Run the $vectorSearch aggregation pipeline in MongoDB Atlas
const client = new MongoClient(MONGODB_URI);
await client.connect();

// Get the collection
const coll = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);

// Run the aggregation pipeline with $vectorSearch, projecting the title, description, and vector search score. Adjust numCandidates and limit as needed. 
const docs = await coll.aggregate([
    {
        $search: {
            index: VECTOR_INDEX_NAME,
            compound: {
                must: [
                    {
                        knnBeta: {
                            path: VECTOR_INDEX_PATH,
                            queryVector,
                            k: 50,  // top K by vector similarity
                        },
                    },
                ],
                should: [
                    {
                        text: {
                            query: SEARCH_QUERY,
                            path: ['title', 'text'],
                            // Slightly boost lexical match so exact terms matter
                            score: { boost: { value: 3 } },
                        },
                    },
                ],
                // Optional: structured filters (example)
                // filter: [
                //   { range: { path: 'year', gte: 1990 } },
                // ],
            },
        },
    },
    { $limit: 10 },
    {
        $project: {
            _id: 0,
            title: 1,
            text: 1,
            url: 1,
            coverImage: 1,
            score: { $meta: 'searchScore' },
        },
    }
]).toArray();

// Output the search results. In a real app, you'd likely want to format this better or return it from an API endpoint.
console.log(JSON.stringify({
    query: SEARCH_QUERY,
    index: VECTOR_INDEX_NAME,
    count: docs.length,
    results: docs
}, null, 2));

// Clean up and close the MongoDB connection when done.
await client.close();
