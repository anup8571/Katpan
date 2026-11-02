import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          install();
        }}
        title="Install Royal Katti 3D App"
        aria-label="Install App"
        className={
          compact
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 border border-amber-400/50 rounded-lg text-xs font-bold cursor-pointer transition-all whitespace-nowrap shrink-0'
            : 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-bold tracking-wider uppercase cursor-pointer transition-all whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={(e) => {
            e.currentTarget.blur();
            setShowIOSGuide(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold cursor-pointer transition-all whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
            <div className="w-full max-w-sm rounded-2xl bg-slate-950 border border-amber-500/50 p-6 shadow-2xl text-slate-100">
              <h3 className="text-base font-bold text-amber-300">Install on iPhone / iPad</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-amber-600 hover:bg-amber-500 py-2 text-xs font-bold text-slate-950 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-amber-950/95 border border-amber-500/50 px-3 py-1.5 text-xs font-semibold text-amber-200 shadow-lg pointer-events-none">
      <span>Offline Mode — Playing from cached casino assets</span>
    </div>
  );
};
