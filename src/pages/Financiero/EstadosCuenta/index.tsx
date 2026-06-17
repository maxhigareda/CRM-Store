import React, { useState, useRef } from 'react';
import { UploadCloud, File, FileText, Loader2, CheckCircle2, X } from 'lucide-react';
import { useNotification } from '../../../contexts/NotificationContext';

export default function EstadosCuenta() {
  const { showNotification } = useNotification();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(newFiles).forEach(file => {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        // Evitar duplicados por nombre y tamaño (básico)
        if (!files.some(f => f.name === file.name && f.size === file.size)) {
          validFiles.push(file);
        }
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      showNotification('error', `Se ignoraron archivos no válidos: ${invalidFiles.join(', ')}. Solo se permiten .txt`);
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      setUploadSuccess(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    validateAndAddFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAddFiles(e.target.files);
    // Resetear el input para permitir subir el mismo archivo si se eliminó y se vuelve a seleccionar
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(files.filter((_, index) => index !== indexToRemove));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch('https://n8n.myinfo.la/webhook/oraculo/normalizador-edos-cuenta', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.statusText}`);
      }

      showNotification('success', `${files.length} estado(s) de cuenta enviado(s) exitosamente para procesamiento.`);
      setFiles([]);
      setUploadSuccess(true);
    } catch (error: any) {
      showNotification('error', 'Error al procesar archivos: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
          Estados de Cuenta
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Arrastra tus estados de cuenta bancarios en formato .txt para registrar los movimientos.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: `3px dashed ${isDragging ? 'var(--primary-color)' : '#cbd5e1'}`,
          borderRadius: '24px',
          padding: '60px 24px',
          textAlign: 'center',
          backgroundColor: isDragging ? '#eff6ff' : '#f8fafc',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '32px'
        }}
      >
        <input
          type="file"
          multiple
          accept=".txt,text/plain"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />

        {uploadSuccess ? (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={40} color="#16a34a" />
            </div>
            <h3 style={{ fontSize: '1.5rem', color: '#16a34a', fontWeight: 700 }}>¡Archivos enviados!</h3>
            <p style={{ color: '#64748b', marginTop: '8px' }}>Puedes subir más archivos haciendo clic o arrastrándolos aquí.</p>
          </div>
        ) : (
          <>
            <div style={{
              width: '80px', height: '80px',
              borderRadius: '50%', background: isDragging ? '#dbeafe' : '#e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', transition: 'all 0.2s ease'
            }}>
              <UploadCloud size={40} color={isDragging ? 'var(--primary-color)' : '#64748b'} />
            </div>
            <h3 style={{ fontSize: '1.25rem', color: '#334155', fontWeight: 700, marginBottom: '8px' }}>
              Haz clic o arrastra tus archivos aquí
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Solo se permiten archivos .txt</p>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <h4 style={{ fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} />
            Archivos listos para procesar ({files.length})
          </h4>

          <div style={{ display: 'grid', gap: '12px', marginBottom: '32px' }}>
            {files.map((file, index) => (
              <div key={index} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  <div style={{
                    background: '#dbeafe',
                    padding: '8px', borderRadius: '8px', flexShrink: 0
                  }}>
                    <File size={20} color="#2563eb" />
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontWeight: 600, color: '#1e293b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={isUploading}
                  style={{
                    background: 'transparent', border: 'none', cursor: isUploading ? 'not-allowed' : 'pointer',
                    color: '#94a3b8', padding: '8px', borderRadius: '8px', flexShrink: 0
                  }}
                  className="hover-bg-slate-100"
                  title="Eliminar archivo"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={isUploading}
              style={{
                padding: '14px 40px', fontSize: '1.1rem', borderRadius: '16px',
                boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Procesando archivos...
                </>
              ) : (
                `Procesar ${files.length} archivo${files.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
