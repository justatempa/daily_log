'use client';

import { useState, KeyboardEvent, FormEvent } from 'react';

interface BottomComposerProps {
  onSend: (message: string) => Promise<void> | void;
}

export default function BottomComposer({ onSend }: BottomComposerProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) {
      return;
    }

    setMessage('');
    try {
      setIsSending(true);
      await Promise.resolve(onSend(trimmedMessage));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSend();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-md z-10">
      <div className="container mx-auto px-3 py-2.5 max-w-5xl">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <textarea
            id="message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入日志内容，Enter 发送，Shift + Enter 换行"
            rows={2}
            className="flex-1 px-3 py-2 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/50 focus:border-[#4F46E5] transition-all resize-none text-sm"
          />
          <button
            type="submit"
            disabled={!message.trim() || isSending}
            className="bg-[#4F46E5] text-white px-4 py-2 rounded-md hover:bg-[#4F46E5]/90 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] justify-center text-sm"
          >
            <i className={`fa ${isSending ? 'fa-spinner fa-spin text-xs' : 'fa-paper-plane text-xs'}`}></i>
            <span>{isSending ? '发送中...' : '发送'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
