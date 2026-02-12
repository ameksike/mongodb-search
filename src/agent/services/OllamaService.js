import { ChatOllama } from '@langchain/ollama';

export class OllamaService {

    /**
     * Constructor for OllamaService. Initializes the ChatOllama client with provided options and sets the call flag to enable/disable actual LLM calls.
     * @param {Object} options - Configuration options for OllamaService
     * @param {string} options.model - Ollama model name (e.g. 'phi3:mini')
     * @param {string} options.baseUrl - Base URL for Ollama API (default 'http://127.0.0.1:11434')
     * @param {boolean} options.call - Flag to enable/disable actual LLM calls (default true). If false, generateAnswer will return a placeholder response without calling the model, which can be useful for testing or if you want to disable LLM calls via query parameter.
     */
    constructor(options) {
        options = options || {};
        options.model = options.model || 'phi3:mini';
        options.baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
        this.chatOllama = new ChatOllama(options);
        this.call = options.call ?? true;
    }

    /**
     * Generate answer using Ollama based on question and context chunks. Constructs a prompt with system instructions and user question+context, then calls the model. Adjust the prompt as needed for better performance.
     * @param {string} question - user question to answer
     * @param {string} context - formatted context string to include in the prompt
     * @returns {Promise<string>}
     */
    async generateAnswer(question, context) {
        const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`;
        const response = await this.chatOllama.invoke(prompt);
        return response.content.trim();
    }

    /**
     * Build a context string from retrieved chunks to include in the prompt. Adjust formatting as needed. 
     * Here we concatenate title and description, but you could also include metadata or other fields.
     * @param {Array<{ title?: string, description?: string, content?: string, metadata?: { title?: string } }>} chunks - retrieved chunks from vector search, which may have different structures depending on your seeding and retrieval logic
     * @returns {string} - formatted context string for the prompt
     */
    buildContext(chunks) {
        return chunks
            .map((chunk, idx) => {
                const title = chunk.title || (chunk.metadata?.title) || `Chunk ${idx + 1}`;
                const body = chunk.description ?? chunk.content ?? '';
                return `### ${title}\n${body}`;
            })
            .join('\n\n');
    }

    /**
     * Get system prompt with instructions for the LLM. Adjust the instructions as needed to improve answer quality. 
     * The prompt should instruct the model to only use the provided context and to respond in the same language as the question.
     */
    getSystemPrompt() {
        const systemPrompt = `
You are a helpful assistant. Answer strictly based on the provided CONTEXT.
If the answer is not in the context, say "I do not know based on the provided context."
Respond in the same language as the user question.
`.trim();

        return systemPrompt;
    }

    /**
     * Invoke the LLM with the constructed prompt. If this.call is false, returns a placeholder response without calling the model,
     * which can be useful for testing or if you want to disable LLM calls via query parameter.
     * @param {string} question - user question
     * @param {Array<{ title?: string, description?: string, content?: string, metadata?: { title?: string } }>} chunks - retrieved context chunks
     * @return {Promise<{ content: string }>} - LLM response content
     */
    getUserPrompt(question, chunks) {
        const context = this.buildContext(chunks);
        return `
QUESTION:
${question}

CONTEXT:
${context}
`.trim();
    }

    /**
     * Main method to invoke the LLM with question and context chunks. Respects the this.call flag to enable/disable actual LLM calls.
     * Constructs system and user prompts, then calls the model and returns the response content.
     * @param {string} question - user question
     * @param {Array<{ title?: string, description?: string, content?: string, metadata?: { title?: string } }>} chunks - retrieved context chunks
     * @return {Promise<{ content: string }>} - LLM response content
     */
    invoke(question, chunks) {
        // This allows us to disable LLM calls for testing or via query parameter.
        if (!this.call) {
            return { content: 'LLM call is disabled' };
        }

        // Build system and user prompts
        const systemPrompt = this.getSystemPrompt();

        // For the user prompt, we can include the question and the context in a structured way.
        // The LLM will then have access to both the question and the relevant context chunks when generating an answer.
        const userPrompt = this.getUserPrompt(question, chunks);

        // Call the LLM with the constructed prompts. The model will receive the system prompt as instructions and the user prompt containing the question and context.
        return this.chatOllama.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ]);
    }
}