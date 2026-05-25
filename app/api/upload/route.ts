import { NextRequest, NextResponse } from 'next/server';
import { chunkText } from '@/lib/chunker';
import { embedBatch } from '@/lib/embeddings';
import { addChunks } from '@/lib/vectorStore';

export const runtime = 'nodejs';

// Polyfill for pdf-parse
// @ts-ignore
if (typeof global.DOMMatrix === 'undefined') {
  // @ts-ignore
  global.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor() {}
    multiply() { return this; }
    inverse() { return this; }
    translate() { return this; }
    scale() { return this; }
    scaleNonUniform() { return this; }
    scaleNonUniformSelf() { return this; }
    rotate() { return this; }
    rotateFromVector() { return this; }
    rotateAxisAngle() { return this; }
    skewX() { return this; }
    skewY() { return this; }
    multiplySelf() { return this; }
    preMultiplySelf() { return this; }
    translateSelf() { return this; }
    scaleSelf() { return this; }
    rotateSelf() { return this; }
    rotateFromVectorSelf() { return this; }
    rotateAxisAngleSelf() { return this; }
    skewXSelf() { return this; }
    skewYSelf() { return this; }
    flipX() { return this; }
    flipY() { return this; }
    get is2D() { return true; }
    get isIdentity() { return true; }
    toJSON() { return {}; }
    toString() { return 'DOMMatrix()'; }
  };
}

// @ts-ignore
if (typeof global.ImageData === 'undefined') {
  // @ts-ignore
  global.ImageData = class ImageData {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
}

// @ts-ignore
if (typeof global.Path2D === 'undefined') {
  // @ts-ignore
  global.Path2D = class Path2D {
    constructor() {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
    fill() {}
    stroke() {}
    clip() {}
    isPointInPath() { return false; }
    isPointInStroke() { return false; }
  };
}

// Increase body size limit for file uploads (Next.js 16 App Router)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const sessionId = formData.get('sessionId') as string | null;
    const file = formData.get('file') as File | null;

    if (!sessionId || !file) {
      return NextResponse.json(
        { error: 'Missing sessionId or file' },
        { status: 400 }
      );
    }

    const fileType = file.type;
    const fileName = file.name;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let rawText = '';

    // ── PDF Extraction ───────────────────────────────────────────────────────
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        let pdfParse = require('pdf-parse');
        // Handle both default export and direct export
        if (pdfParse.default) {
          pdfParse = pdfParse.default;
        }
        const parsed = await pdfParse(buffer);
        rawText = parsed.text || parsed.content || '';
      } catch (pdfErr) {
        console.error('[PDF extraction error]', pdfErr);
        // Fallback: use filename as content
        rawText = `PDF file: ${fileName}. (PDF extraction failed)`;
      }
    }

    // ── Image: send to Groq vision for OCR/description ──────────────────────
    else if (fileType.startsWith('image/')) {
      // Use Groq's vision capability to extract text/description from the image
      const base64 = buffer.toString('base64');
      const mimeType = fileType;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please extract ALL text visible in this image verbatim, and also provide a detailed description of the image content, figures, charts, or diagrams. Format: start with "TEXT:" then the extracted text, then "DESCRIPTION:" then the description.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 2048,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error('Groq vision error:', errText);
        // Fallback: store filename as minimal context
        rawText = `Image file: ${fileName}. (Vision extraction failed — ${errText.slice(0, 200)})`;
      } else {
        const groqData = await groqRes.json();
        rawText = groqData.choices?.[0]?.message?.content ?? '';
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType}` },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: 'Could not extract any text from the file.' },
        { status: 422 }
      );
    }

    // ── Chunk the text ───────────────────────────────────────────────────────
    const chunks = chunkText(rawText, 800, 150);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'Document produced no usable chunks.' },
        { status: 422 }
      );
    }

    // ── Embed all chunks (batch call to HF) ──────────────────────────────────
    const embeddings = await embedBatch(chunks);

    if (embeddings.length !== chunks.length) {
      return NextResponse.json(
        { error: 'Embedding count mismatch.' },
        { status: 500 }
      );
    }

    const docType: 'pdf' | 'image' = fileType.startsWith('image/') ? 'image' : 'pdf';

    // ── Store in vector store ─────────────────────────────────────────────────
    addChunks(
      sessionId,
      chunks.map((text, i) => ({
        docName: fileName,
        docType,
        text,
        embedding: embeddings[i],
      })),
      {
        name: fileName,
        type: docType,
        uploadedAt: Date.now(),
        chunkCount: chunks.length,
      }
    );

    return NextResponse.json({
      success: true,
      document: {
        name: fileName,
        type: docType,
        chunkCount: chunks.length,
        charCount: rawText.length,
      },
    });
  } catch (err: unknown) {
    console.error('[/api/upload] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
