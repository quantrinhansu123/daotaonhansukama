'use client';

import type { VideoQualityLevel } from '@/lib/video-playback';

interface VideoQualitySelectProps {
  levels: VideoQualityLevel[];
  selectedIndex: number;
  onChange: (index: number) => void;
  placement?: 'top-left' | 'top-right';
  disabled?: boolean;
  placeholder?: string;
}

export function VideoQualitySelect({ levels, selectedIndex, onChange, placement = 'top-right', disabled = false, placeholder = 'Đang tải mức chất lượng…' }: VideoQualitySelectProps) {
  return (
    <label className={`absolute top-3 z-20 flex items-center gap-1.5 rounded-lg bg-black/70 px-2 py-1.5 text-xs text-white shadow-lg backdrop-blur ${disabled ? 'opacity-80' : ''} ${placement === 'top-left' ? 'left-3' : 'right-3'}`}>
      <span className="whitespace-nowrap">Chất lượng</span>
      <select
        aria-label="Chọn chất lượng video"
        disabled={disabled || !levels.length}
        className="max-w-48 cursor-pointer rounded border border-white/30 bg-[#111827] px-1.5 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-white/70 disabled:cursor-wait disabled:opacity-80"
        value={selectedIndex}
        onChange={event => onChange(Number(event.target.value))}
      >
        {!levels.length ? <option value={-1}>{placeholder}</option> : <option value={-1}>Tự động</option>}
        {levels.map(level => (
          <option key={level.index} value={level.index}>
            {level.name} ({level.width}×{level.height})
          </option>
        ))}
      </select>
    </label>
  );
}
