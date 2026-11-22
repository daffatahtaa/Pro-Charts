import React from 'react';
import { Download, Copy, Link2, ExternalLink } from 'lucide-react';
import {
  copySnapshotImage,
  copySnapshotLink,
  downloadSnapshot,
  openSnapshotInNewTab,
  postSnapshotToX,
} from '../services/chartSnapshot';

interface SnapshotMenuDropdownProps {
  onClose: () => void;
}

export const SnapshotMenuDropdown: React.FC<SnapshotMenuDropdownProps> = ({ onClose }) => {
  const run = (fn: () => Promise<void>) => {
    onClose();
    void fn();
  };

  return (
    <div
      data-no-marquee="true"
      className="absolute right-0 top-[34px] w-[258px] bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl py-2 z-[70] text-[12.5px] text-[#d1d4dc]"
    >
      <div className="px-3.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#787b86]">
        CHART SNAPSHOT
      </div>

      <button
        type="button"
        onClick={() => run(downloadSnapshot)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          <Download className="w-4 h-4 text-[#b2b5be]" />
          <span>Download image</span>
        </span>
        <span className="text-[11px] text-[#787b86] font-mono-num">Ctrl + Alt + S</span>
      </button>

      <button
        type="button"
        onClick={() => run(copySnapshotImage)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          <Copy className="w-4 h-4 text-[#b2b5be]" />
          <span>Copy image</span>
        </span>
        <span className="text-[11px] text-[#787b86] font-mono-num">Ctrl + Shift + S</span>
      </button>

      <button
        type="button"
        onClick={() => run(copySnapshotLink)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          <Link2 className="w-4 h-4 text-[#b2b5be]" />
          <span>Copy link</span>
        </span>
        <span className="text-[11px] text-[#787b86] font-mono-num">Alt + S</span>
      </button>

      <button
        type="button"
        onClick={() => run(openSnapshotInNewTab)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          <ExternalLink className="w-4 h-4 text-[#b2b5be]" />
          <span>Open in new tab</span>
        </span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      <button
        type="button"
        onClick={() => run(postSnapshotToX)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 fill-current text-[#b2b5be]"
            aria-hidden="true"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>Post image</span>
        </span>
      </button>
    </div>
  );
};
