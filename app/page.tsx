'use client';

import { useState, useRef, useEffect } from 'react';

interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  size: string;
  preview?: string; // base64 for images
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachedFile[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleFileSelect = async (files: FileList | null, type: 'image' | 'pdf') => {
    if (!files) return;
    setShowAttachMenu(false);

    const newFiles: AttachedFile[] = [];

    for (const file of Array.from(files)) {
      const id = Date.now().toString() + Math.random().toString(36).slice(2);
      const attached: AttachedFile = {
        id,
        name: file.name,
        type,
        size: formatFileSize(file.size),
      };

      if (type === 'image') {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        attached.preview = preview;
      }

      newFiles.push(attached);
    }

    setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const text = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: updated[updated.length - 1].content + text,
            };
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) form.requestSubmit();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Syne:wght@700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-deep: #070910;
          --bg-mid: #0d1117;
          --bg-glass: rgba(255,255,255,0.03);
          --border-subtle: rgba(255,255,255,0.07);
          --border-glow: rgba(99,102,241,0.35);
          --text-primary: #f0f2ff;
          --text-muted: #6b7280;
          --text-dim: #374151;
          --indigo: #6366f1;
          --violet: #8b5cf6;
          --cyan: #22d3ee;
          --emerald: #10b981;
        }

        .chat-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100%;
          background: var(--bg-deep);
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
        }

        /* ─── Header ──────────────────────────────────────── */
        .header {
          flex-shrink: 0;
          border-bottom: 1px solid var(--border-subtle);
          background: rgba(7,9,16,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 16px 24px;
        }
        .header-inner {
          max-width: 760px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .header-logo {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          flex-shrink: 0;
          box-shadow: 0 0 18px rgba(99,102,241,0.4);
        }
        .header-title {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 800;
          background: linear-gradient(90deg, #c7d2fe, #a5b4fc, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.3px;
        }
        .header-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--emerald);
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.2);
          border-radius: 100px;
          padding: 3px 9px;
          margin-left: auto;
          letter-spacing: 0.3px;
        }
        .header-badge::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--emerald);
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* ─── Messages ────────────────────────────────────── */
        .messages-area {
          flex: 1;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #1e2533 transparent;
        }
        .messages-area::-webkit-scrollbar { width: 5px; }
        .messages-area::-webkit-scrollbar-track { background: transparent; }
        .messages-area::-webkit-scrollbar-thumb { background: #1e2533; border-radius: 8px; }

        .messages-inner {
          max-width: 760px;
          margin: 0 auto;
          padding: 32px 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          text-align: center;
          gap: 0;
        }
        .empty-orb {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(99,102,241,0.35), transparent 70%),
                      radial-gradient(circle at 65% 65%, rgba(139,92,246,0.25), transparent 70%);
          border: 1px solid rgba(99,102,241,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin-bottom: 24px;
          box-shadow: 0 0 60px rgba(99,102,241,0.15);
          animation: float 4s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .empty-title {
          font-family: 'Syne', sans-serif;
          font-size: 24px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 10px;
          letter-spacing: -0.5px;
        }
        .empty-subtitle {
          font-size: 14px;
          color: var(--text-muted);
          max-width: 340px;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .suggestion-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          max-width: 480px;
        }
        .chip {
          padding: 8px 15px;
          border-radius: 100px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-glass);
          color: #9ca3af;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .chip:hover {
          border-color: rgba(99,102,241,0.4);
          color: #c7d2fe;
          background: rgba(99,102,241,0.07);
          transform: translateY(-1px);
        }

        /* Message Row */
        .msg-row {
          display: flex;
          gap: 12px;
          animation: msg-in 0.25s ease both;
        }
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.assistant { justify-content: flex-start; }

        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          margin-top: 2px;
        }
        .avatar.bot {
          background: linear-gradient(135deg, var(--indigo), var(--violet));
          box-shadow: 0 0 12px rgba(99,102,241,0.3);
        }
        .avatar.user-av {
          background: linear-gradient(135deg, #0ea5e9, var(--cyan));
          box-shadow: 0 0 12px rgba(34,211,238,0.2);
        }

        .bubble {
          max-width: 580px;
          padding: 12px 16px;
          border-radius: 14px;
          font-size: 14px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .bubble.user {
          background: linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%);
          color: #fff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 20px rgba(99,102,241,0.25);
        }
        .bubble.assistant {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-subtle);
          color: #dde1f0;
          border-bottom-left-radius: 4px;
          backdrop-filter: blur(8px);
        }

        /* Attachments in messages */
        .msg-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .msg-img-preview {
          width: 140px;
          height: 100px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .msg-pdf-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 8px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.2);
          color: #fca5a5;
          font-size: 12px;
          max-width: 200px;
        }
        .msg-pdf-icon { font-size: 16px; flex-shrink: 0; }

        /* Loading dots */
        .loading-row { display: flex; gap: 12px; align-items: flex-start; animation: msg-in 0.25s ease both; }
        .loading-bubble {
          padding: 14px 18px;
          border-radius: 14px;
          border-bottom-left-radius: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-subtle);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--indigo);
          animation: bounce-dot 1.2s ease-in-out infinite;
        }
        .dot:nth-child(2) { animation-delay: 0.15s; }
        .dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }

        /* ─── Input Footer ────────────────────────────────── */
        .input-footer {
          flex-shrink: 0;
          padding: 16px 24px 20px;
          background: rgba(7,9,16,0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid var(--border-subtle);
        }
        .input-footer-inner { max-width: 760px; margin: 0 auto; }

        /* Attachment Preview Strip */
        .attach-strip {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .attach-item {
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          animation: pop-in 0.2s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes pop-in {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
        .attach-item-img {
          width: 64px;
          height: 64px;
          object-fit: cover;
          display: block;
        }
        .attach-item-pdf {
          width: 64px;
          height: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: rgba(239,68,68,0.1);
        }
        .attach-item-pdf-icon { font-size: 22px; }
        .attach-item-pdf-label {
          font-size: 9px;
          color: #fca5a5;
          max-width: 56px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
          padding: 0 4px;
        }
        .attach-remove {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(0,0,0,0.75);
          border: none;
          color: #fff;
          font-size: 11px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
          line-height: 1;
        }
        .attach-remove:hover { background: rgba(239,68,68,0.8); }

        /* The main input box */
        .input-box {
          display: flex;
          align-items: flex-end;
          gap: 0;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          padding: 6px 6px 6px 4px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
          box-shadow: 0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03);
          position: relative;
        }
        .input-box:focus-within {
          border-color: var(--border-glow);
          box-shadow: 0 2px 20px rgba(0,0,0,0.4), 0 0 0 3px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
        }

        /* + Attach Button */
        .attach-btn-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .attach-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          border: 1px dashed rgba(99,102,241,0.3);
          background: rgba(99,102,241,0.06);
          color: #818cf8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
          margin: 0 2px;
          font-size: 18px;
          font-weight: 300;
          line-height: 1;
        }
        .attach-btn:hover {
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.6);
          color: #a5b4fc;
          transform: scale(1.05);
        }
        .attach-btn.active {
          background: rgba(99,102,241,0.2);
          border-style: solid;
          border-color: rgba(99,102,241,0.6);
          color: #a5b4fc;
        }

        /* Attach dropdown menu */
        .attach-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          background: #0f1218;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 6px;
          min-width: 180px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
          animation: menu-pop 0.15s cubic-bezier(0.34,1.56,0.64,1) both;
          z-index: 50;
        }
        @keyframes menu-pop {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .attach-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          color: #d1d5db;
          font-size: 13.5px;
          transition: all 0.15s;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: 'DM Sans', sans-serif;
        }
        .attach-menu-item:hover {
          background: rgba(255,255,255,0.06);
          color: #f9fafb;
        }
        .attach-menu-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
        }
        .attach-menu-icon.img { background: rgba(34,211,238,0.12); }
        .attach-menu-icon.pdf { background: rgba(239,68,68,0.12); }
        .attach-menu-label { display: flex; flex-direction: column; gap: 1px; }
        .attach-menu-label span:first-child { font-weight: 500; }
        .attach-menu-label span:last-child { font-size: 11px; color: var(--text-muted); }

        /* Textarea */
        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 14.5px;
          font-family: 'DM Sans', sans-serif;
          line-height: 1.55;
          resize: none;
          padding: 8px 10px 8px 8px;
          min-height: 36px;
          max-height: 160px;
          overflow-y: auto;
          scrollbar-width: none;
        }
        .chat-textarea::-webkit-scrollbar { display: none; }
        .chat-textarea::placeholder { color: #374151; }

        /* Send Button */
        .send-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
          box-shadow: 0 2px 12px rgba(99,102,241,0.35);
        }
        .send-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(99,102,241,0.5);
        }
        .send-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          box-shadow: none;
        }
        .send-btn svg { width: 16px; height: 16px; }

        .input-hint {
          font-size: 11.5px;
          color: #2d3748;
          margin-top: 8px;
          text-align: center;
          letter-spacing: 0.1px;
        }
      `}</style>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files, 'image')}
        id="image-file-input"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files, 'pdf')}
        id="pdf-file-input"
      />

      <main className="chat-root">
        {/* Header */}
        <header className="header">
          <div className="header-inner">
            <div className="header-logo">🤖</div>
            <div>
              <div className="header-title">AI Learning Assistant</div>
            </div>
            <div className="header-badge">Live</div>
          </div>
        </header>

        {/* Messages */}
        <div className="messages-area">
          <div className="messages-inner">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-orb">✦</div>
                <h1 className="empty-title">What can I help you with?</h1>
                <p className="empty-subtitle">
                  Ask me anything — I can read your documents, analyze images, and answer your questions.
                </p>
                <div className="suggestion-chips">
                  {[
                    '📚 Explain a concept',
                    '💻 Help with code',
                    '📄 Summarize a PDF',
                    '🖼️ Analyze an image',
                    '🧠 Brainstorm ideas',
                    '✅ Solve a problem',
                  ].map((chip) => (
                    <button
                      key={chip}
                      className="chip"
                      onClick={() => setInput(chip.slice(3).trim())}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`msg-row ${m.role}`}>
                    {m.role === 'assistant' && (
                      <div className="avatar bot">🤖</div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '6px', maxWidth: '580px' }}>
                      {/* Attachments */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="msg-attachments" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                          {m.attachments.map((att) =>
                            att.type === 'image' && att.preview ? (
                              <img
                                key={att.id}
                                src={att.preview}
                                alt={att.name}
                                className="msg-img-preview"
                              />
                            ) : (
                              <div key={att.id} className="msg-pdf-badge">
                                <span className="msg-pdf-icon">📄</span>
                                <div style={{ overflow: 'hidden' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{att.name}</div>
                                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>{att.size}</div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Message bubble (only if content) */}
                      {m.content && (
                        <div className={`bubble ${m.role}`}>
                          {m.content}
                        </div>
                      )}
                    </div>

                    {m.role === 'user' && (
                      <div className="avatar user-av">👤</div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="loading-row">
                    <div className="avatar bot">🤖</div>
                    <div className="loading-bubble">
                      <div className="dot" />
                      <div className="dot" />
                      <div className="dot" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input Footer */}
        <footer className="input-footer">
          <div className="input-footer-inner">
            {/* Attachment strip */}
            {attachedFiles.length > 0 && (
              <div className="attach-strip">
                {attachedFiles.map((f) => (
                  <div key={f.id} className="attach-item">
                    {f.type === 'image' && f.preview ? (
                      <img src={f.preview} alt={f.name} className="attach-item-img" />
                    ) : (
                      <div className="attach-item-pdf">
                        <span className="attach-item-pdf-icon">📄</span>
                        <span className="attach-item-pdf-label">{f.name}</span>
                      </div>
                    )}
                    <button
                      className="attach-remove"
                      onClick={() => removeAttachment(f.id)}
                      aria-label="Remove attachment"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="input-box">
                {/* + Button */}
                <div className="attach-btn-wrap" ref={attachMenuRef}>
                  <button
                    type="button"
                    className={`attach-btn${showAttachMenu ? ' active' : ''}`}
                    onClick={() => setShowAttachMenu((v) => !v)}
                    aria-label="Attach file"
                    id="attach-toggle-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="8" y1="2" x2="8" y2="14" />
                      <line x1="2" y1="8" x2="14" y2="8" />
                    </svg>
                  </button>

                  {showAttachMenu && (
                    <div className="attach-menu">
                      <button
                        className="attach-menu-item"
                        type="button"
                        onClick={() => { imageInputRef.current?.click(); }}
                        id="attach-image-btn"
                      >
                        <div className="attach-menu-icon img">🖼️</div>
                        <div className="attach-menu-label">
                          <span>Upload Image</span>
                          <span>PNG, JPG, WEBP…</span>
                        </div>
                      </button>
                      <button
                        className="attach-menu-item"
                        type="button"
                        onClick={() => { fileInputRef.current?.click(); }}
                        id="attach-pdf-btn"
                      >
                        <div className="attach-menu-icon pdf">📄</div>
                        <div className="attach-menu-label">
                          <span>Upload PDF</span>
                          <span>PDF documents</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything, or upload an image / PDF…"
                  disabled={isLoading}
                  rows={1}
                  id="chat-input"
                />

                {/* Send */}
                <button
                  type="submit"
                  className="send-btn"
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                  aria-label="Send message"
                  id="send-btn"
                >
                  {isLoading ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                      </path>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="input-hint">Enter to send · Shift+Enter for new line · Click + to attach images or PDFs</p>
            </form>
          </div>
        </footer>
      </main>
    </>
  );
}