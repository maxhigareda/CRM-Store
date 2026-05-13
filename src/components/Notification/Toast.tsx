import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
}

export default function Toast({ type, message, onClose }: ToastProps) {
  const config = {
    success: {
      icon: <CheckCircle2 size={18} />,
      color: '#10b981',
      bg: '#ecfdf5',
      border: '#d1fae5'
    },
    error: {
      icon: <AlertCircle size={18} />,
      color: '#ef4444',
      bg: '#fef2f2',
      border: '#fee2e2'
    },
    info: {
      icon: <Info size={18} />,
      color: '#3b82f6',
      bg: '#eff6ff',
      border: '#dbeafe'
    }
  };

  const { icon, color, bg, border } = config[type];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${border}`,
      borderRadius: '14px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      minWidth: '280px',
      maxWidth: '400px',
      pointerEvents: 'auto',
      animation: 'toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ 
        color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: bg,
        padding: '8px',
        borderRadius: '10px'
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ 
          margin: 0, 
          fontSize: '0.875rem', 
          fontWeight: 700, 
          color: '#1e293b',
          lineHeight: '1.4'
        }}>
          {message}
        </p>
      </div>
      <button 
        onClick={onClose}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          transition: 'all 0.2s'
        }}
      >
        <X size={16} />
      </button>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: '3px',
        width: '100%',
        background: color,
        opacity: 0.3,
        animation: 'toastProgress 4s linear'
      }} />

      <style>{`
        @keyframes toastIn {
          from { transform: translateX(100%) scale(0.9); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
