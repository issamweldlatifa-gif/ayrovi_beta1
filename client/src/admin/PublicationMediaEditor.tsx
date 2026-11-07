import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from './components';
import { uploadPublicationMedia } from './publicationMediaUpload';
export function PublicationMediaEditor({
  form,
  setForm,
  onError,
  onUploading,
}: {
  form: any;
  setForm: Dispatch<SetStateAction<any>>;
  onError: (message: string) => void;
  onUploading: (busy: boolean) => void;
}) {
  const [progress, setProgress] = useState('');
  const change = (index: number, patch: any) =>
    setForm((cur: any) => ({
      ...cur,
      media: cur.media.map((m: any, i: number) =>
        i === index ? { ...m, ...patch } : m
      ),
    }));
  return (
    <div>
      <p>
        Jusqu’à 10 médias ordonnés (images et vidéos). Duo : exactement 2 ;
        photo sociale/shopping : 1 ; vidéo : 1 vidéo. Chaque vidéo exige une
        couverture. Upload : 10 Mo par fichier, vidéos jusqu’à 5 minutes ; MP4
        H.264/AAC recommandé. Les originaux restent conservés séparément. Un
        lien externe exige une couverture et sa compatibilité doit être
        vérifiée.
      </p>
      {(form.media || []).map((item: any, index: number) => (
        <fieldset
          key={`${index}-${item.type}`}
          disabled={!!progress}
          style={{
            marginBottom: 12,
            padding: 12,
            border: '1px solid var(--admin-line)',
          }}
        >
          <legend>Média {index + 1}</legend>
          <label>
            Type{' '}
            <select
              value={item.type}
              onChange={(e) => change(index, { type: e.target.value })}
            >
              <option value="image">Image</option>
              <option value="video">Vidéo</option>
            </select>
          </label>
          <label>
            Adresse{' '}
            <input
              aria-label={`Média ${index + 1}`}
              value={item.url}
              onChange={(e) => change(index, { url: e.target.value })}
            />
          </label>
          <label>
            Texte alternatif{' '}
            <input
              maxLength={160}
              value={item.alt || ''}
              onChange={(e) => change(index, { alt: e.target.value })}
            />
          </label>
          {item.type === 'video' ? (
            <label>
              Couverture{' '}
              <input
                value={item.poster || ''}
                onChange={(e) => change(index, { poster: e.target.value })}
              />
            </label>
          ) : null}
          <label>
            Nature{' '}
            <select
              value={item.purpose || 'scene'}
              onChange={(e) => change(index, { purpose: e.target.value })}
            >
              <option value="scene">Scène / inspiration</option>
              <option value="product">Produit entier / packshot</option>
            </select>
          </label>
          <label>
            Ajustement{' '}
            <select
              aria-label={`Ajustement du média ${index + 1}`}
              value={item.fit || 'auto'}
              onChange={(e) =>
                change(index, {
                  fit: e.target.value === 'auto' ? undefined : e.target.value,
                })
              }
            >
              <option value="auto">Automatique selon la nature</option>
              <option value="contain">Afficher entier</option>
              <option value="cover">Remplir le cadre</option>
            </select>
          </label>
          {item.type === 'image' ? (
            <>
              <label>
                Point focal horizontal{' '}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={item.focalX ?? 50}
                  onChange={(e) =>
                    change(index, { focalX: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Point focal vertical{' '}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={item.focalY ?? 50}
                  onChange={(e) =>
                    change(index, { focalY: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Taille visuelle{' '}
                <input
                  type="range"
                  min={1}
                  max={2}
                  step={0.05}
                  value={item.scale || 1}
                  onChange={(e) =>
                    change(index, { scale: Number(e.target.value) })
                  }
                />
              </label>
            </>
          ) : null}
          <div
            style={{
              maxWidth: 180,
              overflow: 'hidden',
              background: 'white',
              borderRadius: 8,
            }}
          >
            {item.type === 'image' && item.url ? (
              <img
                src={item.url}
                alt={item.alt || 'Aperçu du média'}
                style={{ width: '100%', height: 140, objectFit: 'contain' }}
                onLoad={(e) => {
                  const { naturalWidth: width, naturalHeight: height } =
                    e.currentTarget;
                  if (
                    width &&
                    height &&
                    (item.width !== width || item.height !== height)
                  )
                    change(index, { width, height });
                }}
              />
            ) : item.url ? (
              <video
                src={item.url}
                poster={item.poster || undefined}
                controls
                preload="metadata"
                style={{ width: '100%', maxHeight: 180 }}
                onLoadedMetadata={(e) => {
                  const { videoWidth: width, videoHeight: height } =
                    e.currentTarget;
                  if (
                    width &&
                    height &&
                    (item.width !== width || item.height !== height)
                  )
                    change(index, { width, height });
                }}
              />
            ) : null}
          </div>
          {item.originalUrl ? (
            <a href={item.originalUrl} target="_blank" rel="noreferrer">
              Voir l’original conservé
            </a>
          ) : null}
          <div className="admin-actions">
            <Button
              variant="secondary"
              disabled={!index}
              onClick={() =>
                setForm((cur: any) => {
                  const media = [...cur.media];
                  [media[index - 1], media[index]] = [
                    media[index],
                    media[index - 1],
                  ];
                  return { ...cur, media };
                })
              }
            >
              Monter
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setForm((cur: any) => ({
                  ...cur,
                  media: cur.media.filter((_: any, i: number) => i !== index),
                }))
              }
            >
              Retirer
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={!!progress || (form.media || []).length >= 10}
        onClick={() =>
          setForm((cur: any) => ({
            ...cur,
            media: [
              ...(cur.media || []),
              { type: 'image', url: '', poster: '', alt: '' },
            ],
          }))
        }
      >
        Ajouter un lien média
      </Button>
      <label>
        Importer des médias{' '}
        <input
          aria-label="Uploader les médias Publication"
          disabled={!!progress}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v"
          onChange={async (e) => {
            const input = e.currentTarget;
            const files = Array.from(input.files || []);
            if (files.length + (form.media || []).length > 10) {
              onError('Maximum 10 médias.');
              input.value = '';
              return;
            }
            onError('');
            onUploading(true);
            try {
              for (let i = 0; i < files.length; i++) {
                setProgress(
                  `Import ${i + 1}/${files.length} : ${files[i].name}`
                );
                const media = await uploadPublicationMedia(files[i]);
                setForm((cur: any) => ({
                  ...cur,
                  image_url:
                    cur.image_url ||
                    (media.type === 'video' ? media.poster : media.url),
                  media: [...(cur.media || []), media],
                }));
              }
            } catch (error) {
              onError(
                error instanceof Error
                  ? `${error.message} Les médias déjà importés sont conservés.`
                  : 'Import impossible.'
              );
            } finally {
              setProgress('');
              onUploading(false);
              input.value = '';
            }
          }}
        />
      </label>
      {progress ? <p role="status">{progress}</p> : null}
    </div>
  );
}
