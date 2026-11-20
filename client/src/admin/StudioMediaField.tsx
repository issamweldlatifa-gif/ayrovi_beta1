import { Field } from './components';

export function StudioMediaField({ label, value, kind = 'image', onChange, upload }: { label: string; value: string; kind?: string;
  onChange: (value: string) => void; upload: (file: File, onChange: (url: string) => void) => void }) {
  const accept = kind === 'video' ? 'video/mp4,video/webm,video/quicktime,video/x-m4v' : kind === 'gif' ? 'image/gif' : 'image/jpeg,image/png,image/webp,image/gif';
  return <Field label={label} full>
    <input value={value} maxLength={500} placeholder="URL directe du fichier" onChange={e => onChange(e.target.value)} />
    <input type="file" accept={accept} onChange={e => { const file = e.target.files?.[0]; if (file) upload(file, onChange); e.target.value = ''; }} />
  </Field>;
}
