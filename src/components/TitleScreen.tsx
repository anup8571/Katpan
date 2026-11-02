import React from 'react';

interface TitleScreenProps {
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between items-center p-5 sm:p-8 pointer-events-none select-none">
      {/* Top Royal Crest Lockup */}
      <div
        style={{ backgroundColor: 'rgba(9, 13, 22, 0.88)' }}
        className="flex flex-col items-center text-center mt-1 pointer-events-auto border border-amber-500/40 px-7 py-4 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.85)]"
      >
        <svg
          className="w-14 h-14 sm:w-16 sm:h-16 mb-2"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="46" fill="#090d16" stroke="#d97706" strokeWidth="3.5" />
          <circle
            cx="50"
            cy="50"
            r="39"
            stroke="#b45309"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <path
            d="M28 62 L25 41 L40 52 L50 32 L60 52 L75 41 L72 62 Z"
            fill="#d97706"
            stroke="#fef3c7"
            strokeWidth="2"
          />
          <circle cx="50" cy="32" r="3.5" fill="#dc2626" />
          <circle cx="25" cy="41" r="2.5" fill="#fbbf24" />
          <circle cx="75" cy="41" r="2.5" fill="#fbbf24" />
          <text
            x="50"
            y="77"
            fontSize="11"
            fill="#fde68a"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontWeight="bold"
          >
            ♠ ♥ ♦ ♣
          </text>
        </svg>

        <h1
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          className="text-2xl sm:text-4xl font-black tracking-widest text-amber-300"
        >
          ROYAL KATTI
        </h1>
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-amber-200/75 mt-1">
          Maang Patta • Split-Deck 3D Table
        </p>
      </div>

      {/* Central Negative Space (Shows Live 3D Casino Table) */}
      <div className="flex-1" />

      {/* Bottom Primary Start CTA & Single Control Hint Line */}
      <div className="flex flex-col items-center gap-3 mb-2 pointer-events-auto max-w-sm w-full">
        <button
          data-start="true"
          onClick={onStart}
          style={{ backgroundColor: '#d97706' }}
          className="w-full py-3.5 px-6 rounded-xl font-black text-base sm:text-lg text-slate-950 hover:brightness-110 border-2 border-amber-200 shadow-[0_5px_0_#78350f,0_12px_24px_rgba(0,0,0,0.75)] active:translate-y-1 transition-all cursor-pointer flex items-center justify-center gap-3 tracking-wider"
        >
          <span>ENTER ROYAL TABLE</span>
          <span className="text-[10px] font-extrabold bg-slate-950/20 px-2 py-0.5 rounded text-slate-950">
            SPACE / ENTER
          </span>
        </button>

        <p className="text-[11px] text-slate-300/85 font-medium tracking-wide text-center">
          Space / Enter Deal · Drag Table to Look · C Camera · H Hide Controls · Esc Pause
        </p>
      </div>
    </div>
  );
};
