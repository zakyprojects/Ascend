import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  preventClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  preventClose = false,
}) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => { if (!preventClose) onClose(); }}
      />
      <div className={`modal-panel relative w-full ${maxWidth} bg-bg-800 border border-bg-700 rounded-t-2xl sm:rounded-2xl shadow-xl z-10 animate-slide-up max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-4 border-b border-bg-700 sticky top-0 bg-bg-800 z-10">
          <h2 className="text-lg font-bold text-white tracking-wide">{title}</h2>
          {!preventClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-white hover:bg-bg-700 transition-colors"
            >
              <X className="w-5 h-5"/>
            </button>
          )}
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
