import { Play } from '../components/QatafoIcons';
import {
  mediaFit,
  mediaPosition,
  mediaRatio,
  tileRatio,
  showsPublicationTitle,
  PUBLICATION_SOCIAL_SURFACE,
} from '../../../shared/publicationPresentation';
import {
  resolvePublicationTemplate,
  PUBLICATION_EDITORIAL_RATIO,
  PUBLICATION_EDITORIAL_PAPER,
  CAPTION_FIRST_TEMPLATES,
  SOCIAL_TEMPLATES,
  publicationTiles,
} from '../../../shared/publicationLayouts';
/** Preview uses actual authored media/copy; interactions remain disabled in the CRM preview. */
export function PublicationTemplatePreview({ form }: { form: any }) {
  const template = resolvePublicationTemplate(
    form.template_id,
    form.post_type,
    form.media?.length,
    form.category
  );
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
        padding: campaign ? 24 : split ? 12 : 0,
        minWidth: 0,
        ...(campaign
          ? { background: PUBLICATION_EDITORIAL_PAPER, borderRadius: 4 }
          : {}),
      }}
    >
      {campaign && form.category ? (
        <small>
          {(
            { beauty: 'BEAUTÉ', fashion: 'STYLE', home: 'MAISON' } as Record<
              string,
              string
            >
          )[form.category] || form.category}
        </small>
      ) : null}
      {showsPublicationTitle(template) &&
      form.show_title !== false &&
      form.show_title !== 0 &&
      form.title ? (
        <strong
          style={{
            fontSize: campaign
              ? 32
              : split
              ? 28
              : template === 'carousel'
              ? 22
              : 16,
            fontFamily: 'var(--ay-font-stack)',
            lineHeight: campaign ? 1.2 : 1.4,
            display: 'block',
          }}
        >
          {form.title || 'Titre de la publication'}
        </strong>
      ) : null}
      <p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-ink-muted)' }}>
        {form.description || form.subtitle || 'Description'}
      </p>
      {form.action_label && !captionFirst ? (
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
                      aspectRatio: String(
                        tileRatio(row.map((t) => media[t.index]))
                      ),
                      background: 'white',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={
                        media[tile.index].type === 'video'
                          ? media[tile.index].poster
                          : media[tile.index].url
                      }
                      alt={media[tile.index].alt || `Image ${tile.index + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: mediaFit(media[tile.index]),
                        objectPosition: mediaPosition(media[tile.index]),
                        transform: `scale(${media[tile.index].scale || 1})`,
                        display: 'block',
                      }}
                    />
                    {media[tile.index].type === 'video' ? (
                      <span
                        style={{
                          position: 'absolute',
                          right: 8,
                          bottom: 8,
                          background: 'black',
                          color: 'white',
                          padding: 6,
                          borderRadius: 16,
                        }}
                      >
                        <Play size={20} />
                      </span>
                    ) : null}
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
              aspectRatio: String(
                mediaRatio(
                  media[0] || {},
                  campaign ? PUBLICATION_EDITORIAL_RATIO : 4 / 5
                )
              ),
              height: 'auto',
              background: 'white',
              objectFit: mediaFit(media[0] || {}),
              objectPosition: mediaPosition(media[0] || {}),
              transform: `scale(${media[0]?.scale || 1})`,
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
          <div style={{ background: PUBLICATION_EDITORIAL_PAPER }}>
            {caption}
          </div>
        ) : split ||
          (!captionFirst &&
            template !== 'carousel' &&
            form.description_position !== 'above') ? (
          caption
        ) : null}
      </div>
      {template === 'carousel' && media.length > 1 ? (
        <div
          style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}
        >
          {media.map((m: any, i: number) => (
            <img
              key={i}
              src={m.url}
              alt={`Image ${i + 1}`}
              style={{
                width: 'calc((100% - 16px) / 3)',
                flexShrink: 0,
                aspectRatio: '4/3',
                borderRadius: 8,
                objectFit: m.fit || 'cover',
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
      {template === 'carousel' ? (
        <>
          {caption}
          {(form.products || []).map((p: any) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '12px 0',
                borderTop: '1px solid var(--admin-line)',
              }}
            >
              <img
                src={p.image}
                alt=""
                style={{ width: 56, height: 56, objectFit: 'contain' }}
              />
              <div style={{ flex: 1 }}>
                <strong>{p.name}</strong>
                <div>{p.brand}</div>
                <small>
                  {p.price} {p.currency}
                </small>
              </div>
              <span
                style={{
                  border: '1px solid var(--admin-line)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                Voir le produit
              </span>
            </div>
          ))}
          {!form.products?.length ? (
            <small>
              La fiche compacte apparaît pour les produits catalogue réellement
              associés.
            </small>
          ) : null}
        </>
      ) : null}
      {captionFirst &&
      form.action_label &&
      !(template === 'shoppable' && form.products?.length === 1) ? (
        <div style={{ color: 'var(--ay-e-action)', padding: '10px 0' }}>
          {form.action_label} →
        </div>
      ) : null}
      {template === 'shoppable' ? (
        <div
          data-publication-layout="shoppable"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}
        >
          {(form.products || []).map((p: any) => (
            <div
              key={p.id}
              style={{
                width: form.products.length === 1 ? '100%' : '48%',
                display: form.products.length === 1 ? 'flex' : 'block',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <img
                src={p.image}
                alt={p.name}
                style={{
                  width: form.products.length === 1 ? 56 : '100%',
                  height: form.products.length === 1 ? 56 : undefined,
                  aspectRatio: form.products.length === 1 ? undefined : '3/4',
                  objectFit: 'contain',
                  background: 'var(--admin-surface-sunken)',
                  borderRadius: 8,
                }}
              />
              <div style={{ flex: 1 }}>
                <strong>{p.brand}</strong>
                <div>{p.name}</div>
                <div>
                  {p.price} {p.currency}
                </div>
              </div>
              {form.products.length === 1 ? (
                <span
                  style={{
                    border: '1px solid var(--admin-line)',
                    padding: 8,
                    borderRadius: 8,
                  }}
                >
                  Voir le produit
                </span>
              ) : null}
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
      <div
        aria-hidden
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 30,
          background: PUBLICATION_SOCIAL_SURFACE,
        }}
      >
        ♡ · Commentaires · Partager · Enregistrer
      </div>
      <small>
        Prévisualisation de composition. Les compteurs réels sont affichés dans
        l’application. Albums et carousel : médias mixtes, maximum 10 ; duo : 2
        ; photo sociale/shopping : 1. Chaque vidéo exige une couverture.
      </small>
    </figure>
  );
}
