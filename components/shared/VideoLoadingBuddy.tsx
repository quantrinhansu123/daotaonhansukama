'use client';

import { useEffect, useState } from 'react';

const NOTES = ['Đang mở bài học…', 'Chờ một chút nha', 'Sắp xem được rồi'];

export function VideoLoadingBuddy() {
  const [note, setNote] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNote(current => (current + 1) % NOTES.length), 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#07140e]/75 text-white" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="video-buddy-bob relative h-24 w-24">
          <svg viewBox="0 0 96 96" className="h-full w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" aria-hidden="true">
            <ellipse cx="48" cy="86" rx="18" ry="4" fill="#000" opacity="0.25" />
            <g className="video-buddy-sway" style={{ transformOrigin: '48px 58px' }}>
              <path d="M48 58c-2-10 6-16 14-18-6 6-6 14-4 18" fill="#7dce57" />
              <path d="M48 58c2-10-6-16-14-18 6 6 6 14 4 18" fill="#3f9a45" />
              <path d="M48 34c2 8 2 18 0 28" stroke="#1f6b32" strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
            <circle cx="48" cy="62" r="20" fill="#f6e7c1" />
            <circle cx="41" cy="60" r="2.2" fill="#1d3b28" />
            <circle cx="55" cy="60" r="2.2" fill="#1d3b28" />
            <path d="M42 68c2.2 2.4 9.8 2.4 12 0" stroke="#1d3b28" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <circle cx="37" cy="66" r="2.4" fill="#f2a3b0" opacity="0.85" />
            <circle cx="59" cy="66" r="2.4" fill="#f2a3b0" opacity="0.85" />
          </svg>
        </div>
        <p className="text-[13px] font-bold tracking-wide">{NOTES[note]}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="video-buddy-dot h-1.5 w-1.5 rounded-full bg-[#8ad56a]" />
          <span className="video-buddy-dot h-1.5 w-1.5 rounded-full bg-[#8ad56a] [animation-delay:160ms]" />
          <span className="video-buddy-dot h-1.5 w-1.5 rounded-full bg-[#8ad56a] [animation-delay:320ms]" />
        </div>
      </div>
      <style>{`
        @keyframes video-buddy-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes video-buddy-sway {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(6deg); }
        }
        @keyframes video-buddy-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
        .video-buddy-bob { animation: video-buddy-bob 1.4s ease-in-out infinite; }
        .video-buddy-sway { animation: video-buddy-sway 1.6s ease-in-out infinite; }
        .video-buddy-dot { animation: video-buddy-dot 1.1s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
