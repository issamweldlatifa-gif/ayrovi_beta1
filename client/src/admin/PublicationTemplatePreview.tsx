/** Preview uses actual authored media/copy; interactions remain disabled in the CRM preview. */
export function PublicationTemplatePreview({ form }: { form: any }) {
  const template = form.template_id || 'auto';
  const split = template === 'split';
  const campaign = template === 'campaign';
  const media = form.media || [];
  const source =
    media[0]?.type === 'video'
      ? media[0]?.poster || form.image_url
      : media[0]?.url || form.image_url;
  const caption = (
    <div
      style={{
        padding: split || campaign ? 12 : 0,
        minWidth: 0,
        ...(campaign
          ? { background: 'rgba(255,255,255,.94)', borderRadius: 4 }
          : {}),
      }}
    >
      <strong style={{ fontSize: 16, lineHeight: 1.4, display: 'block' }}>
        {form.title || 'Titre de la publication'}
      </strong>
      <p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-ink-muted)' }}>
        {form.description || form.subtitle || 'Description'}
      </p>
      {form.action_label ? (
        <span
          style={{
            display: 'inline-block',
            color: 'var(--ay-e-action)',
            padding: '10px 0',
          }}
        >
          {form.action_label} →
        </span>
      ) : null}
    </div>
  );
  return (
    <figure
      aria-label="Aperçu du modèle Publication"
      style={{
        margin: 0,
        maxWidth: 420,
        border: '1px solid var(--admin-line)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--admin-surface-card)',
        overflow: 'hidden',
      }}
    >
      <figcaption style={{ padding: '4px 4px 12px', fontWeight: 700 }}>
        ZAYROVI · {template}
      </figcaption>
      <div style={{ display: 'block', overflow: 'hidden', borderRadius: 4 }}>
        {form.description_position === 'above' && !split && !campaign
          ? caption
          : null}
        {source ? (
          <img
            src={source}
            alt="Média choisi"
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: '4/5',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              aspectRatio: '4/5',
              background: 'var(--admin-surface-sunken)',
            }}
          >
            Choisissez un média
          </div>
        )}
        {campaign ? (
          <div style={{ background: 'var(--admin-surface-sunken)' }}>
            {caption}
          </div>
        ) : split || form.description_position !== 'above' ? (
          caption
        ) : null}
      </div>
      {template === 'carousel' && media.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {media.map((m: any, i: number) => (
            <img
              key={i}
              src={m.url}
              alt={`Image ${i + 1}`}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                objectFit: 'cover',
                border:
                  i === 0
                    ? '2px solid var(--ay-e-action)'
                    : '2px solid transparent',
                boxSizing: 'border-box',
              }}
            />
          ))}
        </div>
      ) : null}
      <div aria-hidden style={{ marginTop: 12, padding: 12, opacity: 0.7 }}>
        ♡ · Commentaires · Partager · Enregistrer
      </div>
      <small>
        Prévisualisation de composition. Les compteurs réels sont affichés dans
        l’application. Carousel : 2–10 images ; modèle vidéo : fichier vidéo et
        couverture requis.
      </small>
    </figure>
  );
}
