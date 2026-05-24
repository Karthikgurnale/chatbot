import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import { embed } from '@/lib/embeddings';
import { retrieve, hasDocuments } from '@/lib/vectorStore';

export const runtime = 'nodejs';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  let systemPrompt =
    'You are a helpful AI learning assistant. Be clear, accurate, and educational in your responses.';

  // ── RAG: retrieve context if the session has documents ──────────────────
  if (sessionId && hasDocuments(sessionId)) {
    try {
      // Use the last user message as the retrieval query
      const lastUserMessage = [...messages]
        .reverse()
        .find((m: { role: string }) => m.role === 'user');

      if (lastUserMessage) {
        const queryEmbedding = await embed(lastUserMessage.content);
        const relevantChunks = retrieve(sessionId, queryEmbedding, 5);

        if (relevantChunks.length > 0) {
          const contextBlock = relevantChunks
            .map(
              (chunk, i) =>
                `[Source ${i + 1} — ${chunk.docName}]\n${chunk.text}`
            )
            .join('\n\n---\n\n');

          systemPrompt = `You are a helpful AI learning assistant with access to the user's uploaded documents.

When answering, prioritise information from the provided context below. If the answer is clearly in the context, reference the source document name. If the context doesn't contain the answer, say so honestly and use your general knowledge to help.

<context>
${contextBlock}
</context>

Be clear, accurate, and educational in your responses.`;
        }
      }
    } catch (err) {
      console.error('[RAG retrieval error]', err);
      // Non-fatal: fall through to plain LLM response
    }
  }

  const result = await streamText({
    model: groq('llama-3.3-70b-versatile'),
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}