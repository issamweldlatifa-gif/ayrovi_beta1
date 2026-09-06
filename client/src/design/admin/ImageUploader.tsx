/**
 * ImageUploader — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React, { useState } from 'react';
import { adminApi } from '../../admin/api';
import { Image, X } from '../../components/QatafoIcons';

export const ImageUploader: React.FC<{ value?: string; onChange: (value: string) => void; label?: string }> = ({ value, onChange, label = 'Ajouter une image' }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const choose = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) { setError('Image invalide ou supérieure à 4 Mo.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true); setError('');
      try {
        const response = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl: reader.result }) });
        onChange(response.data.url);
      } catch (reason: any) { setError(reason.message); } finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="admin-image-uploader">
      {value ? <div className="admin-image-preview"><img src={value} alt="Aperçu" /><button type="button" onClick={() => onChange('')}><X size={16} /> Retirer</button></div>
        : <label className="admin-image-drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => choose(event.target.files?.[0])} /><Image size={25} /><strong>{uploading ? 'Envoi…' : label}</strong><span>PNG, JPG, WEBP ou GIF · 4 Mo max</span></label>}
      {error && <small className="admin-field-error">{error}</small>}
    </div>
  );
};
