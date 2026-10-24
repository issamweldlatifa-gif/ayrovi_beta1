/**
 * ImageUploader — primitive du design system ZAYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React, { useState } from 'react';
import { adminApi } from '../../admin/api';
import { Image, X } from '../../components/QatafoIcons';

/**
 * `media` — image (défaut, 4 Mo) ou **vidéo** (10 Mo).
 *
 * Pourquoi la vidéo ici et pas un second composant : le produit porte ses images
 * ET sa vidéo dans la même liste (`catalogue_media`), donc dans le même
 * formulaire. Un second téléverseur aurait dupliqué la logique d'envoi — et
 * c'est exactement ainsi qu'on obtient deux limites de taille différentes.
 */
export const ImageUploader: React.FC<{
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  media?: 'image' | 'video';
}> = ({ value, onChange, label = 'Ajouter une image', media = 'image' }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const isVideo = media === 'video';
  const maxBytes = isVideo ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
  const accept = isVideo ? 'video/mp4,video/webm,video/quicktime' : 'image/png,image/jpeg,image/webp,image/gif';
  const choose = (file?: File) => {
    if (!file) return;
    const rightKind = isVideo ? file.type.startsWith('video/') : file.type.startsWith('image/');
    if (!rightKind || file.size > maxBytes) {
      setError(isVideo ? 'Vidéo invalide ou supérieure à 10 Mo.' : 'Image invalide ou supérieure à 4 Mo.');
      return;
    }
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
      {value ? (
        <div className="admin-image-preview">
          {isVideo
            ? <video src={value} controls preload="metadata" style={{ width: '100%', borderRadius: 8 }} />
            : <img src={value} alt="Aperçu" />}
          <button type="button" onClick={() => onChange('')}><X size={16} /> Retirer</button>
        </div>
      ) : <label className="admin-image-drop"><input type="file" accept={accept} onChange={(event) => choose(event.target.files?.[0])} /><Image size={25} /><strong>{uploading ? 'Envoi…' : label}</strong><span>{isVideo ? 'MP4, WEBM ou MOV · 10 Mo max' : 'PNG, JPG, WEBP ou GIF · 4 Mo max'}</span></label>}
      {error && <small className="admin-field-error">{error}</small>}
    </div>
  );
};
