/**
 * In-memory vector store for RAG.
 *
 * Stores embedded document chunks per session.
 * Data is lost when the server restarts (session-only, as chosen).
 *
 * To upgrade to a persistent store, replace the Map with Pinecone / Upstash / LanceDB.
 */

import { cosineSimilarity } from './embeddings';

export interface DocumentChunk {
  id: string;
  docName: string;       // Original filename
  docType: 'pdf' | 'image';
  text: string;          // Raw chunk text
  embedding: number[];   // Dense vector from HF API
}

export interface StoredDocument {
  name: string;
  type: 'pdf' | 'image';
  uploadedAt: number;
  chunkCount: number;
}

interface SessionStore {
  chunks: DocumentChunk[];
  documents: StoredDocument[];
}

// Global Map keyed by sessionId
const store = new Map<string, SessionStore>();

/**
 * Add chunks for a given session.
 */
export function addChunks(
  sessionId: string,
  chunks: Omit<DocumentChunk, 'id'>[],
  document: StoredDocument
): void {
  if (!store.has(sessionId)) {
    store.set(sessionId, { chunks: [], documents: [] });
  }

  const session = store.get(sessionId)!;

  // Avoid duplicate documents (re-upload replaces)
  session.documents = session.documents.filter((d) => d.name !== document.name);
  session.chunks = session.chunks.filter((c) => c.docName !== document.name);

  const newChunks: DocumentChunk[] = chunks.map((c, i) => ({
    ...c,
    id: `${sessionId}::${document.name}::${i}`,
  }));

  session.chunks.push(...newChunks);
  session.documents.push(document);
}

/**
 * Retrieve the top-K most relevant chunks for a query embedding.
 */
export function retrieve(
  sessionId: string,
  queryEmbedding: number[],
  topK = 5
): DocumentChunk[] {
  const session = store.get(sessionId);
  if (!session || session.chunks.length === 0) return [];

  const scored = session.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.chunk);
}

/**
 * List all documents for a session.
 */
export function listDocuments(sessionId: string): StoredDocument[] {
  return store.get(sessionId)?.documents ?? [];
}

/**
 * Remove a specific document from a session.
 */
export function removeDocument(sessionId: string, docName: string): void {
  const session = store.get(sessionId);
  if (!session) return;
  session.documents = session.documents.filter((d) => d.name !== docName);
  session.chunks = session.chunks.filter((c) => c.docName !== docName);
}

/**
 * Clear all data for a session.
 */
export function clearSession(sessionId: string): void {
  store.delete(sessionId);
}

/**
 * Check if a session has any documents.
 */
export function hasDocuments(sessionId: string): boolean {
  const session = store.get(sessionId);
  return (session?.chunks.length ?? 0) > 0;
}
