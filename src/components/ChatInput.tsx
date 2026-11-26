'use client';

import { Send } from 'lucide-react';
import { forwardRef } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(function ChatInput(
  { value, onChange, onSubmit, disabled, placeholder },
  ref
) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2 items-end">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Type a message...'}
        aria-label="Message"
        disabled={disabled}
        className="flex-1 rounded-lg border px-4 py-3 text-[14px] outline-none transition-colors disabled:opacity-50 placeholder:text-gray-400"
        style={{ borderColor: '#e6e6e6', color: '#141414' }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#ba0c2f';
          e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#e6e6e6';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={disabled || !value.trim()}
        className="shrink-0 rounded-lg p-3 text-white transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
        style={{ background: '#ba0c2f' }}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled) e.currentTarget.style.background = '#9e1b34';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#ba0c2f';
        }}
      >
        <Send size={18} />
      </button>
    </form>
  );
});

export default ChatInput;
