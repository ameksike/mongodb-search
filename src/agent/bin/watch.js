import 'dotenv/config';
import { StoreService } from '../services/StoreService.js';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { mimeFromUrl } from '../utils/utl.js';

const {
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
    VOYAGE_MULTIMODAL_MODEL,
    STORE_BUCKET,
    STORE_ENDPOINT,
    AWS_REGION,
} = process.env;

const srvVoyage = new VoyageAIService({
    apiUrl: VOYAGE_API_URL,
    apiKey: VOYAGE_API_KEY,
    model: VOYAGE_MODEL,
    multimodalModel: VOYAGE_MULTIMODAL_MODEL,
});

const storeService = STORE_BUCKET
    ? new StoreService({
        bucket: STORE_BUCKET,
        region: AWS_REGION,
        endpoint: STORE_ENDPOINT || process.env.S3_ENDPOINT,
    })
    : null;

/**
 * Trigger function to process new documents inserted into the MongoDB collection.
 * @param {*} change - The change event from MongoDB, containing details about the inserted document.
 * @param {*} tools - An object containing helper tools such as the MongoDB collection, assistant for logging, and other context.
 */
export async function insert(change, tools) {
    const { assistant, dbName, collectionName, collection } = tools;
    // Initialize an object to hold the new fields to be added to the document
    const updatedDoc = { embedding: {} };
    const textContent = change?.fullDocument?.description || '';

    try {
        if (!change?.fullDocument?.embedding?.text?.length) {
            // Generate text embedding if description field exists in the inserted document
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
        } else {
            assistant?.logger?.warn({
                flow: tools.flow,
                message: "Text embedding already exist"
            });
        }

        if (!change?.fullDocument?.embedding?.image?.length) {
            // If document has coverImage and we have store + multimodal, load image from store and get image embedding
            const coverImageUrl = change?.fullDocument?.coverImage;
            if (coverImageUrl && storeService) {
                const imageBuffer = await storeService.readFromUrl(coverImageUrl);
                if (imageBuffer?.length) {
                    const mimeType = mimeFromUrl(coverImageUrl);
                    const imageEmbedding = await srvVoyage.getImageEmbedding(imageBuffer, mimeType);
                    if (!imageEmbedding?.length) {
                        assistant?.logger?.warn({
                            flow: tools.flow,
                            message: "No image embedding generated for document",
                            data: {
                                database: dbName,
                                collection: collectionName,
                                documentKey: change.documentKey,
                                coverImageUrl,
                            },
                        });
                    }
                    updatedDoc.embedding.image = imageEmbedding;
                } else {
                    assistant?.logger?.warn({
                        flow: tools.flow,
                        message: "Failed to load image from store for embedding",
                        data: {
                            database: dbName,
                            collection: collectionName,
                            documentKey: change.documentKey,
                            coverImageUrl,
                        },
                    });
                }
            }
        } else {
            assistant?.logger?.warn({
                flow: tools.flow,
                message: "Image embedding already exist"
            });
        }

        // Skip update if no embeddings were generated
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
                title: change?.fullDocument?.title
            },
        });
    }
}

export default function on(change, tools) { }