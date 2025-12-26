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
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
      <div className="container mx-auto px-4 py-4 max-w-5xl">
        <form className="flex gap-3" onSubmit={handleSubmit}>
          <textarea
            id="message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入日志内容，Enter 发送，Shift + Enter 换行"
            rows={2}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/50 focus:border-[#4F46E5] transition-all resize-none"
          />
          <button
            type="submit"
            disabled={!message.trim() || isSending}
            className="bg-[#4F46E5] text-white px-6 py-3 rounded-lg hover:bg-[#4F46E5]/90 transition-colors shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[112px] justify-center"
          >
            <i className={`fa ${isSending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
            <span>{isSending ? '发送中...' : '发送'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
