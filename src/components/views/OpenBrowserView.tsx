import React from 'react';
import { openInExternalBrowser } from '../../utils/browserDetection';

export function OpenBrowserView() {
  const handleOpen = () => {
    openInExternalBrowser(window.location.href);
  };

  return (
    <div 
      onClick={handleOpen}
      className="min-h-screen bg-app-bg flex items-center justify-center p-6 text-center font-sans cursor-pointer select-none"
    >
      <button
        type="button"
        onClick={handleOpen}
        className="text-3xl sm:text-4xl font-bold text-main-fg hover:opacity-80 transition-opacity cursor-pointer"
      >
        Open Browser
      </button>
    </div>
  );
}
