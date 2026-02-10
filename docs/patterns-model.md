
# Model Usage and Adaptation Patterns for LLM-based Systems

When you build an LLM application (chatbot, RAG system, agent, etc.), you make *architectural* choices at two levels:

1. **System architecture** – how you wire together retrieval, vector search, tools, agents, orchestration.
2. **Model usage / adaptation** – how you actually *use* the model: as‑is, with examples in the prompt, with fine-tuning, with a reranker, etc.

This article focuses on **patterns of model usage and adaptation**, explained from an architectural point of view:

1. Zero-shot Prompting  
2. Few-shot / In-Context Learning  
3. Prompt Engineering as a First-Class Component  
4. Fine-tuning (SFT, PEFT/LoRA)  
5. Alignment & Preference Optimization (RLHF / DPO)  
6. Reranking Models  
7. Tool / Function Calling

For cada patrón describimos:

- **Intent** – qué problema resuelve.
- **How it works** – flujo de alto nivel.
- **When to use it** – casos típicos.
- **Architectural view** – cómo encaja con RAG, Vector Search y otros componentes.

---

## 1. Zero-shot Prompting Pattern

### 1.1. Intent

Use a **pretrained, instruction-following LLM** exactly as it comes, *without* examples or task-specific training. You rely on:

- The model’s general knowledge.
- A well-written **system prompt**.
- Optional **retrieved context** from RAG.

### 1.2. How it works

High-level flow:

1. **User Query** arrives at your API.
2. Optional: a **Retrieval Layer** (e.g., MongoDB Vector Search) fetches relevant context (chunks or documents).
3. A **Prompt Builder** constructs a prompt with:
   - System instructions (e.g., “You are a security assistant. Answer only from CONTEXT.”)
   - The user’s question.
   - Optional RAG context (top‑k chunks).
4. The prompt is sent to the **Pretrained LLM**.
5. The LLM generates the answer.

Key point: **no examples, no fine-tuning**; only instructions.

### 1.3. When to use it

- Early prototypes.
- Domains that are close to what the LLM already “knows”.
- When you want to minimize complexity and cost.

### 1.4. Architectural view

Zero-shot is the **simplest model-usage pattern**:

- The LLM is just another component in your architecture: `Prompt → LLM → Answer`.
- You can plug it behind:
  - a naive RAG pipeline,
  - parent-document retrieval,
  - hybrid search,
  - or agentic RAG,
  without changing anything about retrieval; only the prompt layer matters.

---

## 2. Few-shot / In-Context Learning Pattern

### 2.1. Intent

Teach the LLM **how to perform a specific task or format** by including **examples inside the prompt**, without modifying model weights.

### 2.2. How it works

Flow:

1. **Prompt Builder** maintains a small library of **task examples**:
   - `(input → output)` pairs, or `(question + context → answer)` triples.
2. For each user query:
   - It selects a few representative examples (e.g., 2–5).
   - Optionally it retrieves **RAG context** via Vector Search.
3. It constructs a prompt like:

   ```text
   SYSTEM: You are a support assistant. Follow the examples.

   EXAMPLE 1
   Question: ...
   Context: ...
   Answer: ...

   EXAMPLE 2
   Question: ...
   Context: ...
   Answer: ...

   NOW ANSWER:
   Question: {user_question}
   Context: {retrieved_context}
   Answer:
   ```

4. Prompt → **Pretrained LLM** → Answer.

The **“learning”** occurs purely **in context**; the model’s weights do not change.

### 2.3. When to use it

- You want:
  - stable **output formats** (JSON, bullet lists, step-by-step).
  - consistent **tone** or style.
  - better handling of tricky edge cases (e.g., when to say “I don’t know”).

- You don’t yet have the data volume or infra for fine-tuning.

### 2.4. Architectural view

In-Context Learning is a **Prompt Builder responsibility**:

- The retrieval and vector search layers remain the same.
- Your architecture gets an explicit component that:
  - picks examples (possibly using vector similarity against a “prompt examples” library),
  - assembles them with the current query + context.

From an architecture diagram point of view, you have:

```text
User → Prompt Builder (adds few-shot examples + RAG context) → LLM → Answer
```

---

## 3. Prompt Engineering as a First-Class Component

### 3.1. Intent

Treat prompt construction as its **own layer** in the architecture, not just ad-hoc strings in code.

Prompt Engineering, as a pattern, means:

- Separation of concerns:
  - Retrieval / Vector Search.
  - Prompt Construction.
  - LLM Inference.
- Systematic management of:
  - System instructions.
  - User instructions.
  - Examples (few-shot).
  - Retrieved context.
  - Output formatting directives.

### 3.2. How it works

Architectural building blocks:

1. **Retrieval Layer**
   - E.g., MongoDB Atlas Vector Search queries on `chunks.embedding`.
   - Optional hybrid search (vector + full-text).
2. **Prompt Builder / Prompt Template Engine**
   - Combines:
     - System message (rules, persona, safety).
     - Optional few-shot examples.
     - Retrieved context.
     - User question.
   - Applies templates and safety guards.
3. **LLM Gateway**
   - Calls the chosen LLM (local or external) with the assembled prompt.
   - Handles retries, throttling, logging, etc.

You now think of prompts as **versioned templates** that can evolve without touching retrieval logic.

### 3.3. When to use it

- Any production RAG or agent where:
  - you expect to iterate on behavior,
  - multiple teams (ML, apps, content) collaborate on prompts,
  - you want observability into which prompt version was used.

### 3.4. Architectural view

Your high-level architecture becomes:

```text
User
  ↓
Retrieval Layer (Vector Search, filters, hybrid search)
  ↓
Prompt Builder (system rules + few-shot examples + context + user)
  ↓
LLM
  ↓
Answer
```

This is the foundation that later supports patterns like:

- A/B testing of prompts,
- dynamic selection of templates by agent type,
- prompt versioning and rollback.

---

## 4. Fine-tuning Pattern (Base Model → Specialized Model)

### 4.1. Intent

Modify the model itself (its **weights**) so that it behaves better on:

- A specific **domain** (e.g., MongoDB + security + Vault),
- A specific **style** (tone, verbosity),
- Specific **tasks** (classification, structured reasoning, code generation).

Fine-tuning is a pattern for when **prompting alone** (zero-/few-shot) no longer closes the gap.

### 4.2. How it works

We distinguish two levels:

#### A. Full or Supervised Fine-Tuning (SFT)

1. Start from a **Base LLM**.
2. Prepare **training data**: many `(input → desired output)` examples.
3. Run a training job that updates the model’s weights.
4. You obtain a **Specialized LLM**.

#### B. Parameter-Efficient Fine-Tuning (PEFT / LoRA / Adapters)

- Instead of changing all weights, you:
  - learn a small set of extra parameters (adapters),
  - or LoRA low-rank matrices on top of existing layers.
- At inference time:
  - Base model + adapters = Specialized behavior.
- Advantages:
  - smaller checkpoints,
  - easier deployment,
  - can maintain multiple “personas” or domains with different adapter sets.

### 4.3. Deployment patterns

Two canonical deployment patterns:

1. **Direct use**

   ```text
   User → Prompt Builder → Specialized LLM → Answer
   ```

   You rely on model’s parametric knowledge plus prompts.

2. **RAG + Specialized LLM**

   ```text
   User
    ↓
   Retrieval (Vector Search, filters, reranking)
    ↓
   Prompt Builder (injects context)
    ↓
   Specialized LLM
    ↓
   Answer
   ```

   Here fine-tuning often:
   - enforces stronger **grounding** in context,
   - improves **formatting**,
   - reduces hallucinations when no context is present.

### 4.4. When to use it

- Tienes un dataset razonable de historiales Q&A, resoluciones de tickets, documentos con “ground-truth” outputs.
- Zero-shot / few-shot ya están exprimidos y siguen fallando en:
  - dominios muy especializados,
  - razonamiento multi-paso específico,
  - formatos de salida estrictos.

### 4.5. Architectural view

Fine-tuning introduces a new **training pipeline** alongside your inference pipeline:

- Training side:
  - Data collection → Data curation → Fine-tuning job → Model registry.
- Inference side:
  - Your existing RAG/agent architecture, pero cambiando qué modelo se sirve (base vs specialized).

This means you need:

- Model versioning,
- Evaluation before promotion,
- Rollback mechanisms.

---

## 5. Alignment & Preference Optimization Pattern (RLHF, DPO, etc.)

### 5.1. Intent

Even after fine-tuning, models may produce **undesirable behaviors**:

- Toxic or unsafe content,
- Overconfident hallucinations,
- Outputs misaligned with product or brand guidelines.

Alignment and preference optimization aim to:

- Make the model follow **human (or policy) preferences**,
- Improve **helpfulness, harmlessness, honesty**, etc.

### 5.2. How it works (simplified)

A common **two-stage** view:

1. **Supervised Fine-Tuning (SFT)**
   - Train on high-quality demonstrations.
2. **Preference Optimization**
   - Collect preference data:
     - humans or AI labelers compare outputs (A vs B).
   - Optimize the model to pick outputs that align better with the preferred ones.
   - Algorithms:
     - RLHF (Reinforcement Learning from Human Feedback),
     - DPO (Direct Preference Optimization),
     - other offline preference-learning methods.

Result: an **Aligned LLM** that tends to behave according to your policies and guidelines.

### 5.3. When to use it

- Usually at **model-provider level** (OpenAI, Anthropic, MongoDB Voyage, etc.).
- For you as an application builder, alignment is relevant when:
  - you train your own domain-specific LLM and need it to respect safety & brand rules,
  - or you build preference layers around your model.

### 5.4. Architectural view

You have two pipelines:

- **Training pipeline**:
  - Base LLM → SFT → Preference optimization → Aligned LLM.
- **Application pipeline**:
  - Your RAG/agent architecture calls **Aligned LLM** instead of a raw base model.

From your app’s perspective, alignment is mostly a **property of the model you choose**. You still combine it with:

- Prompt engineering,
- Few-shot examples,
- RAG,
- Reranking, etc.

---

## 6. Reranking Model Pattern

### 6.1. Intent

Improve **retrieval precision** by adding a dedicated model that **reorders candidates** returned by vector search.

Instead of trusting the top‑k from Vector Search directly, you:

- Retrieve a larger candidate set (`k_large`),
- Use a **reranker** to score each candidate against the query,
- Pass only the **top‑N best** to the generation LLM.

### 6.2. How it works

1. **Vector Search (Recall)**
   - Use MongoDB Atlas Vector Search on `chunks.embedding`.
   - Retrieve `k_large` candidates (e.g., 20–50).
2. **Reranker Model**
   - For each candidate chunk:
     - Input = `[Question] + [Chunk Text]` (or similar).
     - Model outputs a relevance score.
   - Models can be:
     - dedicated cross-encoder rerankers (e.g., Voyage Reranker),
     - small LLMs used purely as rankers.
3. **Top‑N Selection**
   - Sort candidates by reranker score.
   - Keep `N` best (e.g., 4–6).
4. **Generation LLM**
   - Prompt builder uses these top‑N as context for the main LLM.

### 6.3. When to use it

- When vector search returns **too much noise** among top‑k.
- You want high **precision** in the chunks that hit the LLM.
- You can afford some extra latency / compute at retrieval time.

### 6.4. Architectural view

Retrieval architecture becomes a **two-stage funnel**:

```text
User Query
  ↓
Vector Search (k_large candidates)
  ↓
Reranker Model (scores and reorders candidates)
  ↓
Top-N Context Chunks
  ↓
Prompt Builder → Generation LLM → Answer
```

Reranking is orthogonal to zero-/few-shot/fine-tuning:

- You can use any LLM (base, fine-tuned, aligned) as generation model.
- Reranking is a separate model component specialized in relevance.

---

## 7. Tool / Function Calling Pattern

### 7.1. Intent

Allow the LLM to **call external tools** (like Vector Search, HTTP APIs, databases) when it needs extra information or capabilities, instead of always answering from its internal knowledge directly.

This is central to **agentic architectures**.

### 7.2. How it works

1. You declare a set of **tools / functions** the LLM can call, e.g.:

   - `vector_search(query, filters)` – wraps MongoDB Atlas Vector Search.
   - `get_user_profile(userId)` – HTTP API.
   - `run_sql(query)` – analytics DB.

2. At inference time:
   - LLM receives the user request and a tool schema.
   - It decides (based on prompt & policies) whether to:
     - answer directly,
     - or call one or more tools.
3. Tools execute **outside the model** (your code).
4. Tool results are fed back into the LLM as **additional context**.
5. LLM uses these results to craft the final answer.

### 7.3. When to use it

- When you want **live data** (not just static knowledge).
- When you need **complex actions**:
  - multi-step retrieval,
  - queries across multiple systems,
  - writing back to databases or ticketing systems.
- When implementing **Agentic RAG**:
  - LLM chooses when/how to call vector search, graders, rewriters, etc.

### 7.4. Architectural view

From an architecture perspective:

```text
User
  ↓
Chat / Agent API
  ↓
LLM (with tool-calling capability)
   ├─→ Direct Answer
   └─→ Tool Calls:
        - Vector Search Tool (MongoDB)
        - Other APIs
        (results → back into LLM)
  ↓
Final Answer
```

This pattern does not replace RAG; rather, it **upgrades** how the model interacts with RAG:

- Instead of always doing retrieval unconditionally, the LLM/agent can:
  - inspect the question,
  - decide whether to call Vector Search (and with which filters),
  - possibly loop with graders and rewriters (Agentic RAG).

---

## 8. Summary

From the point of view of **model usage and adaptation**, the main patterns you can combine in a production LLM stack are:

- **Zero-shot Prompting** – simplest, no examples, no training.
- **Few-shot / In-Context Learning** – add examples into the prompt to teach patterns and formats.
- **Prompt Engineering** – make prompt construction a first-class, modular part of the architecture.
- **Fine-tuning (SFT, PEFT/LoRA)** – adapt model weights for domain and tasks when prompts aren’t enough.
- **Alignment & Preference Optimization** – ensure model outputs follow human or policy preferences.
- **Reranking Models** – dedicated models to reorder retrieval candidates for higher precision.
- **Tool / Function Calling** – let the model call external tools (especially Vector Search) as needed.

All of them can be layered on top of, or alongside:

- MongoDB Atlas Vector Search,
- RAG retrieval patterns (parent-document, hybrid search, filtered search),
- and agentic orchestration (LangChain, LangGraph, custom agents).

Understanding **which pattern solves which problem** is the key to designing LLM systems that are accurate, safe, efficient, and maintainable.
