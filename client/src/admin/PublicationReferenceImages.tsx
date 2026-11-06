/** User-supplied editorial references. Selecting a photo edits only the current draft. */
const REFERENCES = [
  ['look-street.jpg', 'Look street'],
  ['look-denim.jpg', 'Look denim'],
  ['look-boots.jpg', 'Look bottes'],
  ['look-denim-detail.jpg', 'Détail denim'],
  ['look-blue-knit.jpg', 'Maille bleue'],
  ['look-black-top.jpg', 'Look noir'],
  ['campaign-red.jpeg', 'Campagne rouge'],
  ['shoe-black.jpg', 'Chaussure noire'],
  ['shoe-cream.jpg', 'Chaussure crème'],
];
export function PublicationReferenceImages({
  form,
  onChange,
}: {
  form: any;
  onChange: (form: any) => void;
}) {
  const max = ['caption_photo', 'shoppable'].includes(form.template_id)
    ? 1
    : form.template_id === 'social_pair'
    ? 2
    : 10;
  return (
    <section aria-label="Photos de référence fournies">
      <strong>Photos de référence fournies</strong>
      <p>
        Ajoutez aux médias ordonnés du brouillon. Aucune publication
        automatique. Maximum pour ce modèle : {max}.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REFERENCES.map(([file, label]) => {
          const url = `/media/publications/style-references/${file}`;
          return (
            <button
              key={file}
              type="button"
              aria-label={`Ajouter la référence : ${label}`}
              disabled={(form.media?.length || 0) >= max}
              onClick={() =>
                onChange({
                  ...form,
                  image_url: form.image_url || url,
                  media: [
                    ...(form.media || []),
                    { type: 'image', url, poster: '', alt: label },
                  ],
                })
              }
              style={{
                width: 88,
                padding: 4,
                border: '1px solid var(--admin-line)',
                background: 'var(--admin-surface-card)',
                color: 'var(--admin-ink)',
                borderRadius: 4,
              }}
            >
              <img
                src={url}
                alt=""
                style={{
                  width: '100%',
                  height: 88,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <small>{label}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
