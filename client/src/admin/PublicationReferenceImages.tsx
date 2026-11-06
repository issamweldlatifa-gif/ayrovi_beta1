/** User-supplied editorial references. Selecting a photo edits only the current draft. */
const REFERENCES = [
  ['editorial-beauty-mirror.jpg', 'Éditorial beauté', 'generated'],
  ['bag-editorial-caramel.jpg', 'Sac caramel', 'generated'],
  ['bag-editorial-brown.jpg', 'Sac brun', 'generated'],
  ['bag-editorial-ivory.jpg', 'Sac ivoire', 'generated'],
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
  const preset = (kind: 'campaign' | 'carousel') => {
    if (
      form.media?.length &&
      !window.confirm(
        'Remplacer les médias de ce brouillon par la composition choisie ?'
      )
    )
      return;
    const files =
      kind === 'campaign'
        ? ['editorial-beauty-mirror.jpg']
        : [
            'bag-editorial-caramel.jpg',
            'bag-editorial-brown.jpg',
            'bag-editorial-ivory.jpg',
          ];
    const media = files.map((file) => ({
      type: 'image',
      url: `/media/publications/${file}`,
      poster: '',
      alt:
        kind === 'campaign'
          ? 'Rituel beauté au miroir'
          : 'Accessoire de saison',
    }));
    onChange({
      ...form,
      template_id: kind,
      post_type: kind === 'carousel' ? 'carousel' : 'image',
      status: 'brouillon',
      media_origin: 'generated',
      media,
      image_url: media[0].url,
      description_position: 'below',
      category: kind === 'campaign' ? 'beauty' : form.category || '',
      title:
        form.title ||
        (kind === 'campaign'
          ? 'Votre nouveau rituel.'
          : 'Les essentiels de saison'),
      description:
        form.description ||
        (kind === 'campaign'
          ? 'Une touche de couleur. Toute votre personnalité.'
          : 'Trois pièces, une allure.'),
      action_label:
        kind === 'campaign'
          ? form.action_label || 'Découvrir la sélection'
          : form.action_label || '',
      action_target: form.action_target || 'detail',
    });
  };
  return (
    <section aria-label="Photos de référence fournies">
      <strong>Compositions éditoriales & photos de référence</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" onClick={() => preset('campaign')}>
          Utiliser le modèle éditorial beauté
        </button>
        <button type="button" onClick={() => preset('carousel')}>
          Utiliser le carousel de sacs
        </button>
      </div>
      <p>
        Ces compositions remplissent un brouillon, sans publication automatique.
        Pour la fiche « Voir le produit », associez un véritable produit
        catalogue dans Produits liés.
      </p>
      <p>
        Ajoutez aux médias ordonnés du brouillon. Aucune publication
        automatique. Maximum pour ce modèle : {max}.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REFERENCES.map(([file, label, origin]) => {
          const url =
            origin === 'generated'
              ? `/media/publications/${file}`
              : `/media/publications/style-references/${file}`;
          return (
            <button
              key={file}
              type="button"
              aria-label={`Ajouter la référence : ${label}`}
              disabled={(form.media?.length || 0) >= max}
              onClick={() =>
                onChange({
                  ...form,
                  ...(origin === 'generated'
                    ? { media_origin: 'generated' }
                    : {}),
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
