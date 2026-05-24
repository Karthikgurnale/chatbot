/**
 * Splits a long text into overlapping chunks suitable for embedding.
 *
 * @param text        - The raw document text to chunk
 * @param chunkSize   - Target number of characters per chunk (default 800)
 * @param overlap     - Number of overlapping characters between chunks (default 150)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150
): string[] {
  // Normalise whitespace
  const normalised = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

  if (normalised.length <= chunkSize) return [normalised];

  const chunks: string[] = [];

  // Try to split on paragraph / sentence boundaries first
  const paragraphs = normalised.split(/\n{2,}/);
  let buffer = '';

  for (const para of paragraphs) {
    if ((buffer + '\n\n' + para).length <= chunkSize) {
      buffer = buffer ? buffer + '\n\n' + para : para;
    } else {
      if (buffer) chunks.push(buffer.trim());

      // If the paragraph itself is longer than chunkSize, split it at sentence level
      if (para.length > chunkSize) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentBuffer = '';
        for (const s of sentences) {
          if ((sentBuffer + ' ' + s).length <= chunkSize) {
            sentBuffer = sentBuffer ? sentBuffer + ' ' + s : s;
          } else {
            if (sentBuffer) chunks.push(sentBuffer.trim());
            sentBuffer = s;
          }
        }
        if (sentBuffer) buffer = sentBuffer;
        else buffer = '';
      } else {
        buffer = para;
      }
    }
  }

  if (buffer) chunks.push(buffer.trim());

  // Add overlap: prepend the last `overlap` characters of the previous chunk
  const overlappedChunks: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      overlappedChunks.push(chunks[i]);
    } else {
      const prev = chunks[i - 1];
      const tail = prev.slice(-overlap);
      overlappedChunks.push((tail + ' ' + chunks[i]).trim());
    }
  }

  return overlappedChunks.filter((c) => c.length > 20);
}
