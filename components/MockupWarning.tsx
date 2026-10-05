'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function MockupWarning() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('sample-data-warning-dismissed');
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('sample-data-warning-dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-yellow-500 flex-shrink-0"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-700 dark:text-yellow-200">
              <strong className="font-semibold">Sample data:</strong> the figures on this page are placeholders. Trade, Perps,
              Swap, Pools and Portfolio use live QRDX chain data.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-yellow-700 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-yellow-100 transition-colors p-1 rounded hover:bg-yellow-500/10"
            aria-label="Dismiss warning"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
