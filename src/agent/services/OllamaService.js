import { ChatOllama } from '@langchain/ollama';

export class OllamaService {

    constructor(options) {
        options = options || {};
        options.model = options.model || 'phi3:mini';
        options.baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
        this.chatOllama = new ChatOllama(options);
        this.call = options.call ?? true;
    }

    async generateAnswer(question, context) {
        const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`;
        const response = await this.chatOllama.invoke(prompt);
        return response.content.trim();
    }

    buildContext(chunks) {
        return chunks
            .map((chunk, idx) => {
                const title = chunk.title || (chunk.metadata?.title) || `Chunk ${idx + 1}`;
                const body = chunk.description ?? chunk.content ?? '';
                return `### ${title}\n${body}`;
            })
            .join('\n\n');
    }

    getSystemPrompt() {
        const systemPrompt = `
You are a helpful assistant. Answer strictly based on the provided CONTEXT.
If the answer is not in the context, say "I do not know based on the provided context."
Respond in the same language as the user question.
`.trim();

        return systemPrompt;
    }

    getUserPrompt(question, chunks) {
        const context = this.buildContext(chunks);
        return `
QUESTION:
${question}

CONTEXT:
${context}
`.trim();
    }

    invoke(question, chunks) {
        if (!this.call) {
            return { content: 'LLM call is disabled' };
        }

        const systemPrompt = this.getSystemPrompt();
        const userPrompt = this.getUserPrompt(question, chunks);

        return this.chatOllama.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ]);
    }

}