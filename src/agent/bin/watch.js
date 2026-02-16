import { VoyageAIService } from '../services/VoyageAIService.js';

// Load environment variables
const {
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
} = process.env;

// Initialize VoyageAIService outside of the insert function to reuse across calls
const srvVoyage = new VoyageAIService({
    apiUrl: VOYAGE_API_URL,
    apiKey: VOYAGE_API_KEY,
    model: VOYAGE_MODEL,
});

/**
 * Trigger function to process new documents inserted into the MongoDB collection.
 * @param {*} change - The change event from MongoDB, containing details about the inserted document.
 * @param {*} tools - An object containing helper tools such as the MongoDB collection, assistant for logging, and other context.
 */
export async function insert(change, tools) {
    const { assistant, dbName, collectionName, collection } = tools;

    try {
        // Initialize an object to hold the new fields to be added to the document
        const updatedDoc = { embedding: {} };

        // Generate text embedding if description field exists in the inserted document
        const textContent = change?.fullDocument?.description || '';
        const textEmbedding = textContent && await srvVoyage.getEmbedding(textContent);

        // Log a warning if no text embedding was generated for a document that has a description field
        if (!textEmbedding?.length) {
            assistant?.logger?.warn({
                flow: tools.flow,
                message: "No text embedding generated for document",
                data: {
                    database: dbName,
                    collection: collectionName,
                    documentKey: change.documentKey,
                    description: textContent,
                },
            });
        } else {
            updatedDoc.embedding.text = textEmbedding;
        }

        // check if the document has an image or text to embed, if not skip the update
        if (!updatedDoc.embedding.text?.length && !updatedDoc.embedding.image?.length) {
            assistant?.logger?.warn({
                flow: tools.flow,
                message: "No actions taken on document due to missing embeddings",
                data: {
                    database: dbName,
                    collection: collectionName,
                    documentKey: change.documentKey,
                    description: textContent,
                },
            });
            return;
        }

        // Update the document with the new embeddings
        const res = await collection.updateOne(change.documentKey, { $set: updatedDoc });

        // Log the successful embedding update
        assistant?.logger?.info({
            flow: tools.flow,
            message: "Document inserted with embeddings",
            data: {
                database: dbName,
                collection: collectionName,
                document: change.fullDocument,
                embedding: {
                    text: updatedDoc.embedding.text?.length,
                    image: updatedDoc.embedding.image?.length,
                },
                updateResult: res
            },
        });
    }
    catch (err) {
        // Log any errors that occur during the embedding generation or document update process
        assistant?.logger?.error({
            flow: tools.flow,
            message: "Error processing document insertion",
            data: {
                error: err.message,
                database: dbName,
                collection: collectionName,
                documentKey: change.documentKey,
            },
        });
    }
}