'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

export type Rating = 'up' | 'down';

interface MessageFeedbackProps {
  rating: Rating | null;
  // Persist a rating, clear it (null), and optionally attach a comment.
  onRate: (rating: Rating | null, comment?: string) => void;
}

// Per-answer 👍/👎 control shown under each assistant message. A thumbs-down
// reveals an optional one-line comment box so the content team learns *why* an
// answer missed. Clicking the active rating again clears it.
export default function MessageFeedback({ rating, onRate }: MessageFeedbackProps) {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [commentSent, setCommentSent] = useState(false);

  function handleClick(next: Rating) {
    if (rating === next) {
      // Toggle off.
      onRate(null);
      setShowComment(false);
      setCommentSent(false);
      return;
    }
    onRate(next);
    setCommentSent(false);
    setShowComment(next === 'down');
  }

  function submitComment() {
    onRate('down', comment);
    setShowComment(false);
    setCommentSent(true);
  }

  const baseBtn =
    'flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer';

  return (
    <div className="mt-2.5 pt-2 border-t" style={{ borderColor: '#f0f0f0' }}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#999' }}>
          Helpful?
        </span>
        <button
          type="button"
          onClick={() => handleClick('up')}
          aria-pressed={rating === 'up'}
          aria-label="Helpful"
          title="Helpful"
          className={baseBtn}
          style={
            rating === 'up'
              ? { background: 'rgba(34,139,34,0.12)', color: '#1f7a1f' }
              : { color: '#999' }
          }
        >
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => handleClick('down')}
          aria-pressed={rating === 'down'}
          aria-label="Not helpful"
          title="Not helpful"
          className={baseBtn}
          style={
            rating === 'down'
              ? { background: 'rgba(186,12,47,0.10)', color: '#ba0c2f' }
              : { color: '#999' }
          }
        >
          <ThumbsDown size={14} />
        </button>
        {commentSent && (
          <span className="text-[11px] ml-1.5" style={{ color: '#1f7a1f' }}>
            Thanks for the feedback!
          </span>
        )}
      </div>

      {showComment && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitComment();
            }}
            placeholder="What was missing or wrong? (optional)"
            maxLength={2000}
            className="flex-1 text-[12px] px-2.5 py-1.5 rounded-md border outline-none focus:border-byuh-crimson"
            style={{ borderColor: '#e6e6e6', color: '#141414' }}
          />
          <button
            type="button"
            onClick={submitComment}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md text-white cursor-pointer"
            style={{ background: '#ba0c2f' }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
