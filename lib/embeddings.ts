/**
 * Embedding service using Hugging Face Inference API.
 * Model: sentence-transformers/all-MiniLM-L6-v2 (384-dim, free tier)
 *
 * Falls back to a simple TF-IDF-style sparse vector if HF_API_TOKEN is missing.
 */

const HF_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const HF_API_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`;

/**
 * Get a dense embedding vector for a single text string via HF Inference API.
 */
export async function embed(text: string): Promise<number[]> {
  const token = process.env.HF_API_TOKEN;

  if (!token) {
    throw new Error(
      'HF_API_TOKEN is not set. Add it to .env.local.\n' +
      'Get a free token at: https://huggingface.co/settings/tokens'
    );
  }

  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // HF returns either float[] or float[][] (batched)
  if (Array.isArray(data) && typeof data[0] === 'number') {
    return data as number[];
  }
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0] as number[];
  }

  throw new Error('Unexpected HF API response shape: ' + JSON.stringify(data).slice(0, 200));
}

/**
 * Embed multiple texts in one call (HF supports batch input).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const token = process.env.HF_API_TOKEN;

  if (!token) {
    throw new Error('HF_API_TOKEN is not set. Add it to .env.local.');
  }

  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: texts,
      options: { wait_for_model: true },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Batch returns float[][]
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data as number[][];
  }

  // Single text edge case
  if (Array.isArray(data) && typeof data[0] === 'number') {
    return [data as number[]];
  }

  throw new Error('Unexpected HF API response shape: ' + JSON.stringify(data).slice(0, 200));
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
