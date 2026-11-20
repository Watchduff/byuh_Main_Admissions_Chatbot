'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

type MessageSource = { sourceId: string; url: string; title?: string };

function getMessageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function getMessageSources(msg: UIMessage): MessageSource[] {
  return msg.parts.filter(
    (p): p is { type: 'source-url'; sourceId: string; url: string; title?: string } =>
      p.type === 'source-url'
  );
}

function formatSourceLabel(source: { url: string; title?: string }): string {
  if (source.title && source.title !== source.url) {
    return source.title.length > 32 ? source.title.slice(0, 30) + '...' : source.title;
  }
  try {
    const path = new URL(source.url).pathname;
    const segment = path.split('/').filter(Boolean).pop();
    return segment ? segment.replace(/-/g, ' ') : 'Source';
  } catch {
    return 'Source';
  }
}

interface ChatMessagesProps {
  messages: UIMessage[];
  showTypingDots: boolean;
  // Optional alternate avatar image used in each assistant bubble.
  assistantBadgeSrc?: string;
  // Optional per-message slot rendered below an assistant answer (used for the
  // 👍/👎 feedback control). Return null to render nothing for a message.
  renderFeedback?: (message: UIMessage) => React.ReactNode;
}

export default function ChatMessages({
  messages,
  showTypingDots,
  assistantBadgeSrc = '/logo.png',
  renderFeedback,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showTypingDots]);

  return (
    <>
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {m.role === 'assistant' && (
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-2.5 mt-0.5"
              style={{ background: '#ba0c2f' }}>
              <Image
                src={assistantBadgeSrc}
                alt=""
                width={20}
                height={14}
                className="h-3 w-auto brightness-0 invert"
              />
            </div>
          )}
          <div
            className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
              m.role === 'user'
                ? 'rounded-br-sm text-white'
                : 'rounded-bl-sm bg-white border shadow-sm'
            }`}
            style={
              m.role === 'user'
                ? { background: '#ba0c2f' }
                : { borderColor: '#e6e6e6' }
            }
          >
            {m.role === 'user' ? (
              <p className="whitespace-pre-wrap">{getMessageText(m)}</p>
            ) : (
              <>
                <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-code:text-gray-700 prose-code:bg-gray-50 prose-code:px-1 prose-code:rounded prose-strong:font-semibold"
                  style={{
                    '--tw-prose-headings': '#141414',
                    '--tw-prose-links': '#946f0a',
                    '--tw-prose-bold': '#141414',
                  } as React.CSSProperties}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children, ...props }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {getMessageText(m)}
                  </ReactMarkdown>
                </div>
                {getMessageSources(m).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t" style={{ borderColor: '#f0f0f0' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider self-center mr-0.5" style={{ color: '#999' }}>
                      Sources
                    </span>
                    {getMessageSources(m).map((source) => (
                      <div key={source.sourceId} className="group/badge relative">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors no-underline"
                          style={{
                            background: 'rgba(148, 111, 10, 0.08)',
                            color: '#946f0a',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(148, 111, 10, 0.18)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(148, 111, 10, 0.08)';
                          }}
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          <span>{formatSourceLabel(source)}</span>
                        </a>
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover/badge:block z-50 pointer-events-none">
                          <div
                            className="bg-white rounded-lg shadow-lg border p-3 min-w-[220px] max-w-[320px] pointer-events-auto"
                            style={{ borderColor: '#e6e6e6' }}
                          >
                            <p className="text-[12px] font-semibold mb-1" style={{ color: '#141414' }}>
                              {source.title || 'Source page'}
                            </p>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] break-all leading-relaxed hover:underline"
                              style={{ color: '#946f0a' }}
                            >
                              {source.url}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {renderFeedback?.(m)}
              </>
            )}
          </div>
        </div>
      ))}

      {showTypingDots && (
        <div className="flex justify-start">
          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-2.5 mt-0.5"
            style={{ background: '#ba0c2f' }}>
            <Image src={assistantBadgeSrc} alt="" width={20} height={14} className="h-3 w-auto brightness-0 invert" />
          </div>
          <div className="bg-white border rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm"
            style={{ borderColor: '#e6e6e6' }}>
            <div className="flex gap-1.5 items-center h-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: '#ba0c2f',
                    animation: `chatpulse 1.4s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </>
  );
}
