import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { VoyageAIService } from './services/VoyageAIService.js';

const {
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_COLLECTION,
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
} = process.env;

if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');
if (!VOYAGE_API_URL || !VOYAGE_API_KEY || !VOYAGE_MODEL) {
    throw new Error('Missing VoyageAI configuration');
}

const client = new MongoClient(MONGODB_URI);

const srvVoyage = new VoyageAIService({
    apiUrl: VOYAGE_API_URL,
    apiKey: VOYAGE_API_KEY,
    model: VOYAGE_MODEL,
});

function chunkText(text, maxChars = 800) {
    const chunks = [];
    let offset = 0;

    while (offset < text.length) {
        chunks.push(text.slice(offset, offset + maxChars));
        offset += maxChars;
    }
    return chunks;
}

async function ingestDocument({ sourceId, title, url, text }) {
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);

    const rawChunks = chunkText(text);
    const docsToInsert = [];

    for (let i = 0; i < rawChunks.length; i++) {
        const chunkContent = rawChunks[i];
        const embedding = await srvVoyage.getEmbedding(chunkContent);
        docsToInsert.push({
            sourceId,
            chunkId: i,
            content: chunkContent,
            metadata: { title, url },
            embedding,
        });
    }

    if (docsToInsert.length > 0) {
        await collection.insertMany(docsToInsert);
        console.log(`Ingested ${docsToInsert.length} chunks for sourceId=${sourceId}`);
    }
}

async function main() {
    try {
        await client.connect();

        const exampleDoc = {
            sourceId: 'doc-manual-001',
            title: 'Product Manual',
            url: 'https://example.com/manual',
            text: 'Long manual text...',
        };

        await ingestDocument(exampleDoc);
    } finally {
        await client.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
