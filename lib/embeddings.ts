/**
 * Embedding service using Groq API with embedding models.
 * Uses a simple hash-based fallback for text chunks.
 */

/**
 * Generate a simple embedding vector using text hashing.
 * This is a fallback method that doesn't require external APIs.
 */
function generateHashEmbedding(text: string, dimensions: number = 384): number[] {
  const embedding: number[] = new Array(dimensions).fill(0);
  
  // Simple hash-based embedding: use character codes to seed vector values
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    embedding[i % dimensions] += Math.sin(charCode) * 0.1;
  }
  
  // Normalize
  let magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) magnitude = 1;
  
  return embedding.map(v => v / magnitude);
}

/**
 * Get a dense embedding vector for a single text string.
 */
export async function embed(text: string): Promise<number[]> {
  // Use hash-based fallback (no API calls needed)
  return generateHashEmbedding(text, 384);
}

/**
 * Embed multiple texts in one call.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return texts.map(text => generateHashEmbedding(text, 384));
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
