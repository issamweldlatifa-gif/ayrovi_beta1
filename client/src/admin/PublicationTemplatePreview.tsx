import {
  CAPTION_FIRST_TEMPLATES,
  SOCIAL_TEMPLATES,
  publicationTiles,
} from '../../../shared/publicationLayouts';
/** Preview uses actual authored media/copy; interactions remain disabled in the CRM preview. */
export function PublicationTemplatePreview({ form }: { form: any }) {
  const template = form.template_id || 'auto';
  const captionFirst = (CAPTION_FIRST_TEMPLATES as readonly string[]).includes(
    template
  );
  const social = (SOCIAL_TEMPLATES as readonly string[]).includes(template);
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
      {!captionFirst || !(form.description || form.subtitle) ? (
        <strong style={{ fontSize: 16, lineHeight: 1.4, display: 'block' }}>
          {form.title || 'Titre de la publication'}
        </strong>
      ) : null}
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
        {(captionFirst || form.description_position === 'above') &&
        !split &&
        !campaign
          ? caption
          : null}
        {social ? (
          <div
            data-publication-layout={template}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {publicationTiles(template, media.length).map((row, r) => (
              <div key={r} style={{ display: 'flex', gap: 2 }}>
                {row.map((tile) => (
                  <div
                    key={tile.index}
                    style={{
                      position: 'relative',
                      flex: 1,
                      minWidth: 0,
                      aspectRatio: '1',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={media[tile.index].url}
                      alt={media[tile.index].alt || `Image ${tile.index + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    {tile.remaining ? (
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,.4)',
                          color: 'white',
                          fontSize: 32,
                        }}
                      >
                        +{tile.remaining}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : source ? (
          <img
            src={source}
            alt="Média choisi"
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: captionFirst ? undefined : '4/5',
              height: captionFirst ? 'auto' : undefined,
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
        ) : split ||
          (!captionFirst && form.description_position !== 'above') ? (
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
      {template === 'shoppable' ? (
        <div
          data-publication-layout="shoppable"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}
        >
          {(form.products || []).map((p: any) => (
            <div key={p.id} style={{ width: '48%' }}>
              <img
                src={p.image}
                alt={p.name}
                style={{
                  width: '100%',
                  aspectRatio: '3/4',
                  objectFit: 'contain',
                  background: 'var(--admin-surface-sunken)',
                  borderRadius: 8,
                }}
              />
              <strong>{p.brand}</strong>
              <div>{p.name}</div>
              <div>
                {p.price} {p.currency}
              </div>
            </div>
          ))}
          {!form.products?.length ? (
            <small>
              Cartes des produits catalogue associés affichées ici dans
              l’application. Utilisez « Produits liés » ci-dessous ; aucune
              carte fictive n’est créée.
            </small>
          ) : null}
        </div>
      ) : null}
      <div aria-hidden style={{ marginTop: 12, padding: 12, opacity: 0.7 }}>
        ♡ · Commentaires · Partager · Enregistrer
      </div>
      <small>
        Prévisualisation de composition. Les compteurs réels sont affichés dans
        l’application. Albums : 2–10 images, duo : exactement 2, photo/shopping
        : 1 image. Carousel : 2–10 images ; modèle vidéo : fichier vidéo et
        couverture requis.
      </small>
    </figure>
  );
}
