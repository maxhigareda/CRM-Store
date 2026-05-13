import React, { useState } from 'react';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar', 
  isDestructive = false,
  onConfirm, 
  onClose 
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ maxWidth: '400px', padding: '0' }}>
        <div style={{ padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ 
            background: isDestructive ? '#fef2f2' : '#eff6ff', 
            color: isDestructive ? '#ef4444' : '#3b82f6', 
            padding: '12px', 
            borderRadius: '50%',
            flexShrink: 0
          }}>
            {isDestructive ? <AlertTriangle size={24} /> : <HelpCircle size={24} />}
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', marginTop: '4px' }}>
              {title}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {message}
            </p>
          </div>
        </div>
        <div style={{ background: '#f8fafc', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
          {cancelText && (
            <button className="btn btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>
              {cancelText}
            </button>
          )}
          <button 
            className="btn" 
            style={{ 
              padding: '8px 16px', 
              background: isDestructive ? '#ef4444' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              fontWeight: 700
            }} 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptModal({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  onConfirm,
  onClose
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: '1.25rem' }}>{title}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '0.95rem' }}>{message}</p>
            <input 
              type="text" 
              className="form-input" 
              placeholder={placeholder}
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{cancelText}</button>
            <button type="submit" className="btn btn-primary" disabled={!value.trim()}>{confirmText}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
