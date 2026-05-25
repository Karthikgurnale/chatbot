'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  size: string;
  preview?: string; // base64 for images
  file: File;       // raw file for upload
}

interface LoadedDocument {
  name: string;
  type: 'pdf' | 'image';
  chunkCount: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Omit<AttachedFile, 'file'>[];
  usedRAG?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [loadedDocs, setLoadedDocs] = useState<LoadedDocument[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [sessionId] = useState<string>(generateSessionId);
  const [uploadError, setUploadError] = useState<string>('');

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mockedChats] = useState([
    { id: 'chat_1', title: 'Redesign chat interface', date: '2026-05-25' },
    { id: 'chat_2', title: 'JS chunker implementation', date: '2026-05-24' },
    { id: 'chat_3', title: 'PDF parsing using pdf-parse', date: '2026-05-22' },
    { id: 'chat_4', title: 'Vector store queries', date: '2026-05-20' },
    { id: 'chat_5', title: 'Next.js 16 breaking changes', date: '2026-05-18' },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Sync initial theme
  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  // ── File selection ──────────────────────────────────────────────────────

  const handleFileSelect = async (files: FileList | null, type: 'image' | 'pdf') => {
    if (!files) return;
    setShowAttachMenu(false);
    setUploadError('');

    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      const id = Date.now().toString() + Math.random().toString(36).slice(2);
      const attached: AttachedFile = {
        id,
        name: file.name,
        type,
        size: formatFileSize(file.size),
        file,
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

  const removeAttachment = (id: string) =>
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));

  const removeLoadedDoc = async (docName: string) => {
    setLoadedDocs((prev) => prev.filter((d) => d.name !== docName));
  };

  // ── Upload files to /api/upload before chatting ─────────────────────────

  const uploadFiles = useCallback(
    async (files: AttachedFile[]): Promise<LoadedDocument[]> => {
      const uploaded: LoadedDocument[] = [];
      for (const f of files) {
        setUploadProgress(`Processing "${f.name}"…`);
        const form = new FormData();
        form.append('sessionId', sessionId);
        form.append('file', f.file);

        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? 'Upload failed');
        uploaded.push(data.document as LoadedDocument);
      }
      return uploaded;
    },
    [sessionId]
  );

  // ── Submit handler ──────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;
    setUploadError('');

    // 1. Upload any attached files first
    let newDocs: LoadedDocument[] = [];
    if (attachedFiles.length > 0) {
      setIsUploading(true);
      try {
        newDocs = await uploadFiles(attachedFiles);
        setLoadedDocs((prev) => {
          const names = new Set(newDocs.map((d) => d.name));
          return [...prev.filter((d) => !names.has(d.name)), ...newDocs];
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setUploadError(msg);
        setIsUploading(false);
        setUploadProgress('');
        return;
      } finally {
        setIsUploading(false);
        setUploadProgress('');
      }
    }

    // If only files were attached with no text, auto-prompt the user
    const userText = input.trim() ||
      (newDocs.length > 0 ? `I've uploaded ${newDocs.map((d) => d.name).join(', ')}. Please summarise the content.` : '');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      attachments: attachedFiles.map(({ id, name, type, size, preview }) => ({
        id, name, type, size, preview,
      })),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    // 2. Chat with RAG context
    try {
      const hasAnyDocs = (loadedDocs.length + newDocs.length) > 0;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: hasAnyDocs ? sessionId : undefined,
          messages: [
            ...messages,
            { role: 'user', content: userText },
          ].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        usedRAG: hasAnyDocs,
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

  const startNewChat = () => {
    setMessages([]);
    setAttachedFiles([]);
    setLoadedDocs([]);
    setUploadError('');
    setInput('');
  };

  const loadMockChat = (title: string) => {
    setMessages([
      { id: 'm1', role: 'user', content: `Load archived session: ${title}` },
      { id: 'm2', role: 'assistant', content: `Loaded showcase data for "${title}". Chat persistence and database history loading is not fully enabled in this version.` }
    ]);
  };

  const canSubmit = !isLoading && !isUploading && (!!input.trim() || attachedFiles.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        /* Base Reset */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .chat-viewport {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          background: var(--bg-deep);
        }

        .messages-inner {
          max-width: 720px;
          margin: 0 auto;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        /* Collapsible Sidebar Details */
        .sidebar-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-mid);
        }
        
        .new-session-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid var(--border-subtle);
          background: var(--bg-deep);
          color: var(--text-primary);
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        .new-session-btn:hover {
          border-color: var(--border-strong);
          background: var(--bg-hover);
        }

        .session-list-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          width: 100%;
          padding: 10px 14px;
          background: var(--bg-deep);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }
        .session-list-item:hover {
          background: var(--bg-hover);
          border-color: var(--border-strong);
        }
        .session-list-title {
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
        }
        .session-list-date {
          font-family: var(--font-geist-mono), monospace;
          font-size: 9.5px;
          color: var(--text-dim);
          margin-top: 3px;
        }

        /* Empty State Suggestions */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 0;
          text-align: center;
          max-width: 580px;
          margin: 0 auto;
        }
        
        .empty-icon-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-primary);
          margin-bottom: 20px;
        }

        .empty-title {
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 22px;
          font-weight: 600;
          margin-bottom: 8px;
          letter-spacing: -0.3px;
          color: var(--text-primary);
        }
        
        .empty-subtitle {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-muted);
          margin-bottom: 32px;
        }

        .suggestion-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          width: 100%;
        }
        @media(max-width: 520px) {
          .suggestion-grid { grid-template-columns: 1fr; }
        }
        
        .suggestion-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-mid);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          font-size: 13px;
          color: var(--text-primary);
          font-family: var(--font-geist-sans), sans-serif;
        }
        .suggestion-card:hover {
          border-color: var(--text-muted);
          background: var(--bg-hover);
          transform: translateY(-1px);
        }
        .suggestion-arrow {
          color: var(--text-dim);
          font-size: 11px;
          transition: transform 0.2s ease;
        }
        .suggestion-card:hover .suggestion-arrow {
          color: var(--text-primary);
          transform: translateX(2px);
        }

        /* Message Stream */
        .msg-row {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          animation: msg-fade-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes msg-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-row.user {
          flex-direction: row-reverse;
        }

        .avatar-circle {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 50%;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          color: var(--text-primary);
        }
        .msg-row.user .avatar-circle {
          border-color: var(--border-strong);
          background: var(--text-primary);
          color: var(--bg-deep);
        }

        .msg-wrapper {
          display: flex;
          flex-direction: column;
          max-width: calc(100% - 46px);
          gap: 6px;
        }
        .msg-row.user .msg-wrapper {
          align-items: flex-end;
        }

        .msg-bubble {
          font-size: 14.5px;
          line-height: 1.6;
          padding: 12px 18px;
          border-radius: 12px;
          background: var(--bg-mid);
          color: var(--text-primary);
          white-space: pre-wrap;
          word-break: break-word;
          border: 1px solid var(--border-subtle);
        }
        .msg-row.user .msg-bubble {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-bottom-right-radius: 2px;
        }
        .msg-row.assistant .msg-bubble {
          background: var(--bg-mid);
          border-bottom-left-radius: 2px;
        }

        /* Message File Attachments */
        .msg-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 4px;
        }
        .msg-attachment-img {
          max-width: 280px;
          max-height: 180px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
        }
        .msg-attachment-pdf {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          font-family: var(--font-geist-mono), monospace;
          font-size: 11.5px;
          color: var(--text-primary);
        }

        .rag-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-geist-mono), monospace;
          font-size: 10px;
          color: var(--emerald);
          margin-top: 4px;
        }

        /* Loading */
        .loading-bubble {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 12px 18px;
          border-radius: 12px;
          border-bottom-left-radius: 2px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          animation: bounce 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) { animation-delay: 0.15s; }
        .dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* Floating Input Container */
        .input-footer {
          padding: 16px 24px 28px;
          background: var(--bg-deep);
        }
        .input-footer-inner {
          max-width: 720px;
          margin: 0 auto;
        }
        
        .input-card {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          border-radius: 14px;
          overflow: visible; /* Needed for absolute dropdown attach-menu */
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-card:focus-within {
          border-color: var(--text-muted);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .input-row {
          display: flex;
          align-items: flex-end;
          padding: 8px 12px;
          gap: 8px;
          width: 100%;
          position: relative;
        }
        
        .plus-attach-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px dashed var(--border-subtle);
          background: var(--bg-deep);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
          margin-bottom: 2px;
        }
        .plus-attach-btn:hover, .plus-attach-btn.active {
          border-color: var(--border-strong);
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        
        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 14.5px;
          line-height: 1.5;
          resize: none;
          padding: 6px 4px;
          min-height: 32px;
          max-height: 160px;
          color: var(--text-primary);
        }
        .chat-textarea::placeholder {
          color: var(--text-dim);
        }
        
        .send-btn-solid {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--text-primary);
          color: var(--bg-deep);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
          margin-bottom: 2px;
        }
        .send-btn-solid:hover:not(:disabled) {
          opacity: 0.9;
          transform: scale(1.05);
        }
        .send-btn-solid:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }

        .input-footer-hint {
          margin-top: 8px;
          font-family: var(--font-geist-mono), monospace;
          font-size: 9px;
          color: var(--text-dim);
          text-align: center;
        }
        
        /* Dropdown upload items (Opens upwards) */
        .attach-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          background: var(--bg-mid);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 50;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
          min-width: 150px;
        }
        .attach-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-primary);
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 12.5px;
          cursor: pointer;
          text-align: left;
          width: 100%;
        }
        .attach-menu-item:hover {
          background: var(--bg-hover);
        }
        
        /* Pills progress */
        .upload-status-pills {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
        }
        .upload-status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          color: var(--text-primary);
        }
        .upload-status-item.error {
          border-color: var(--red);
          color: var(--red);
          background: rgba(239, 68, 68, 0.02);
        }
        .spinner {
          width: 12px;
          height: 12px;
          border: 2px solid var(--text-dim);
          border-top-color: var(--text-primary);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .attach-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }
        .attach-pill {
          position: relative;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-mid);
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 12px;
          color: var(--text-primary);
        }
        .attach-pill-img {
          width: 18px;
          height: 18px;
          object-fit: cover;
          border-radius: 3px;
        }
        .attach-pill-remove {
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding-left: 4px;
        }
        .attach-pill-remove:hover {
          color: var(--red);
        }

        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display:'none' }}
        onChange={(e) => handleFileSelect(e.target.files, 'image')} id="image-file-input" />
      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple style={{ display:'none' }}
        onChange={(e) => handleFileSelect(e.target.files, 'pdf')} id="pdf-file-input" />

      <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-deep)] text-[var(--text-primary)] font-sans antialiased">
        
        {/* Collapsible Sidebar */}
        <aside className={`flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-mid)] transition-all duration-200 ease-in-out ${sidebarOpen ? 'w-[260px]' : 'w-0 pointer-events-none md:w-0'}`}>
          <div className="sidebar-container w-[260px]">
            
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] h-14">
              <span className="font-mono text-xs tracking-wider uppercase font-semibold text-[var(--text-primary)]">
                chatbot // rag
              </span>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                title="Collapse sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-4">
              <button 
                onClick={startNewChat}
                className="new-session-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Session
              </button>
            </div>

            {/* Previous Chats List */}
            <div className="flex-1 overflow-y-auto px-3 scrollbar-none">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-dim)] mb-2.5 px-2">
                Recent sessions
              </div>
              <div className="flex flex-col gap-2">
                {mockedChats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => loadMockChat(c.title)}
                    className="session-list-item"
                  >
                    <span className="session-list-title">
                      {c.title}
                    </span>
                    <span className="session-list-date">
                      {c.date}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-mid)] h-14">
              <span className="text-[10px] font-mono text-[var(--text-dim)]">v0.1.0 // Antigravity</span>
              
              {/* Theme Toggle Button */}
              <button
                onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg border border-[var(--border-subtle)] hover:border-var(--text-muted) bg-transparent text-[var(--text-primary)] transition-all flex items-center justify-center cursor-pointer hover:bg-[var(--bg-hover)]"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-deep)]">
          
          {/* Top Header - Premium Polish */}
          <header className="flex items-center justify-between px-6 border-b border-[var(--border-subtle)] h-14 bg-[var(--bg-mid)] backdrop-blur-md bg-opacity-95">
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-all cursor-pointer flex items-center justify-center"
                  title="Show sidebar"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold text-sm tracking-tight text-[var(--text-primary)]">
                  Knowledge Assistant
                </span>
                <span className="text-[9px] font-mono tracking-wider text-[var(--text-muted)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded bg-[var(--bg-deep)]">
                  RAG ENGINE
                </span>
              </div>
            </div>

            {/* Model Tag & Status */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] bg-[var(--bg-deep)] px-2.5 py-0.5 rounded-full">
                model: groq/llama-4-scout
              </span>
              
              {loadedDocs.length > 0 && (
                <span className="text-[10px] font-mono text-[var(--text-primary)] border border-[var(--border-subtle)] bg-[var(--bg-deep)] px-2 py-0.5 rounded-full">
                  docs: {loadedDocs.length}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] bg-[var(--bg-deep)] px-2.5 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                ready
              </span>
            </div>
          </header>

          {/* Loaded Document Pills below header */}
          {loadedDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-mid)] overflow-x-auto">
              {loadedDocs.map((doc) => (
                <div key={doc.name} className="flex items-center gap-1.5 px-2.5 py-0.5 border border-[var(--border-subtle)] bg-[var(--bg-deep)] text-[11px] font-mono text-[var(--text-primary)] rounded-md">
                  <span>{doc.type === 'pdf' ? '📄' : '🖼️'}</span>
                  <span className="max-w-[140px] truncate">{doc.name}</span>
                  <span className="text-[9px] text-[var(--text-dim)]">({doc.chunkCount} chk)</span>
                  <button 
                    onClick={() => removeLoadedDoc(doc.name)}
                    className="text-[var(--text-dim)] hover:text-[var(--red)] transition-colors ml-1 cursor-pointer"
                    aria-label={`Remove ${doc.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Messages Viewport */}
          <div className="messages-area">
            <div className="messages-inner">
              {messages.length === 0 ? (
                
                /* Refined Empty State Dashboard */
                <div className="empty-state">
                  <div className="empty-icon-box">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 22 7 22 17 12 22 2 17 2 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                  <h1 className="empty-title">
                    Knowledge Assistant
                  </h1>
                  <p className="empty-subtitle">
                    A clean space to analyze your images and documents. Drag or click the plus (+) button below to upload PDFs or pictures, then query using RAG.
                  </p>
                  
                  <div className="suggestion-grid">
                    {[
                      'Explain a concept',
                      'Help with code',
                      'Summarise this PDF',
                      'Analyse an image',
                      'Brainstorm ideas',
                      'Solve a problem',
                    ].map((chip) => (
                      <button key={chip} className="suggestion-card" onClick={() => setInput(chip)}>
                        <span>{chip}</span>
                        <span className="suggestion-arrow">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Messages rendering */}
                  {messages.map((m) => (
                    <div key={m.id} className={`msg-row ${m.role}`}>
                      
                      {/* Modern Round Avatars */}
                      <div className="avatar-circle" title={m.role === 'assistant' ? 'Assistant' : 'User'}>
                        {m.role === 'assistant' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 22 7 22 17 12 22 2 17 2 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        )}
                      </div>

                      {/* Content Wrap */}
                      <div className="msg-wrapper">
                        
                        {/* Attachments */}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="msg-attachments">
                            {m.attachments.map((att) =>
                              att.type === 'image' && att.preview ? (
                                <img key={att.id} src={att.preview} alt={att.name} className="msg-attachment-img" />
                              ) : (
                                <div key={att.id} className="msg-attachment-pdf">
                                  <span>📄</span>
                                  <div style={{ overflow:'hidden' }}>
                                    <div style={{ fontWeight: 550, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{att.name}</div>
                                    <div style={{ fontSize:9.5, color:'var(--text-dim)', marginTop: 2 }}>{att.size}</div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Text Content */}
                        {m.content && <div className="msg-bubble">{m.content}</div>}

                        {/* RAG Label */}
                        {m.role === 'assistant' && m.usedRAG && (
                          <span className="rag-indicator">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" />
                            </svg>
                            RAG Contextual Answer
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Loading */}
                  {isLoading && (
                    <div className="loading-row msg-row assistant">
                      <div className="avatar-circle" title="Assistant">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 22 7 22 17 12 22 2 17 2 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </div>
                      <div className="msg-wrapper">
                        <div className="loading-bubble">
                          <div className="dot" /><div className="dot" /><div className="dot" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Floating Input Footer Bar */}
          <footer className="input-footer">
            <div className="input-footer-inner">
              
              {/* Progress and status alerts */}
              {(isUploading || uploadError) && (
                <div className="upload-status-pills">
                  {isUploading && (
                    <div className="upload-status-item">
                      <div className="spinner" />
                      <span>{uploadProgress || 'Processing document…'}</span>
                    </div>
                  )}
                  {uploadError && (
                    <div className="upload-status-item error">
                      <span>⚠️</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadError}</span>
                      <button onClick={() => setUploadError('')} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:14 }}>×</button>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments preview strip */}
              {attachedFiles.length > 0 && (
                <div className="attach-strip">
                  {attachedFiles.map((f) => (
                    <div key={f.id} className="attach-pill">
                      {f.type === 'image' && f.preview ? (
                        <img src={f.preview} alt={f.name} className="attach-pill-img" />
                      ) : (
                        <span>📄</span>
                      )}
                      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <button className="attach-pill-remove" onClick={() => removeAttachment(f.id)} type="button" aria-label="Remove attachment">×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Card Container */}
              <form onSubmit={handleSubmit}>
                <div className="input-card">
                  
                  {/* Unified Input Row */}
                  <div className="input-row">
                    
                    {/* circular dashed plus (+) button */}
                    <div className="relative flex items-center" ref={attachMenuRef}>
                      <button
                        type="button"
                        className={`plus-attach-btn ${showAttachMenu ? 'active' : ''}`}
                        onClick={() => setShowAttachMenu((v) => !v)}
                        disabled={isUploading || isLoading}
                        id="attach-toggle-btn"
                        aria-label="Attach file"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>

                      {/* Dropdown upload links */}
                      {showAttachMenu && (
                        <div className="attach-menu">
                          <button className="attach-menu-item" type="button" onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }} id="attach-image-btn">
                            <span>🖼️</span> Image File
                          </button>
                          <button className="attach-menu-item" type="button" onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} id="attach-pdf-btn">
                            <span>📄</span> PDF Document
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
                      placeholder={loadedDocs.length > 0 ? 'Ask about your loaded files…' : 'Type a query or upload a file…'}
                      disabled={isLoading || isUploading}
                      rows={1}
                      id="chat-input"
                    />

                    {/* Send Button */}
                    <button type="submit" className="send-btn-solid" disabled={!canSubmit} id="send-btn">
                      {isLoading || isUploading ? (
                        <div className="spinner" style={{ borderTopColor: 'var(--bg-mid)', width: 10, height: 10 }} />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="input-footer-hint">
                  Press Enter to send · Shift+Enter for new line · Attach documents for contextual RAG analysis
                </div>
              </form>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}