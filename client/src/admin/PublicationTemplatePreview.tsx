/** Preview uses actual authored media/copy; interactions remain disabled in the CRM preview. */
export function PublicationTemplatePreview({ form }: { form: any }) {
  const template = form.template_id || 'auto';
  const split = template === 'split'; const campaign = template === 'campaign';
  const media = form.media || []; const source = media[0]?.type === 'video' ? media[0]?.poster || form.image_url : media[0]?.url || form.image_url;
  const caption = <div style={{ padding: 16, minWidth: 0, ...(campaign ? { background: 'rgba(255,255,255,.94)', borderRadius: 20 } : {}) }}><strong style={{ fontSize: 22, lineHeight: 1.15, display: 'block' }}>{form.title || 'Titre de la publication'}</strong><p style={{ whiteSpace: 'pre-wrap', color: 'var(--admin-ink-muted)' }}>{form.description || form.subtitle || 'Description'}</p>{form.action_label ? <span style={{ display: 'inline-block', borderRadius: 99, background: 'var(--ay-e-accent-soft)', color: 'var(--ay-e-action)', padding: '10px 18px' }}>{form.action_label} →</span> : null}</div>;
  return <figure aria-label="Aperçu du modèle Publication" style={{ margin: 0, maxWidth: 420, border: '1px solid var(--admin-line)', borderRadius: 24, padding: 12, background: 'var(--admin-surface-card)', overflow: 'hidden' }}>
    <figcaption style={{ padding: '4px 4px 12px', fontWeight: 700 }}>ZAYROVI · {template}</figcaption>
    <div style={{ display: split ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', position: 'relative', overflow: 'hidden', borderRadius: 20 }}>
      {form.description_position === 'above' && !split && !campaign ? caption : null}
      {source ? <img src={source} alt="Média choisi" style={{ display: 'block', width: '100%', aspectRatio: split ? '3/5' : '4/5', objectFit: 'cover' }} /> : <div style={{ aspectRatio: '4/5', background: 'var(--admin-surface-sunken)' }}>Choisissez un média</div>}
      {campaign ? <div style={{ position: 'absolute', inset: 'auto 12px 12px' }}>{caption}</div> : split || form.description_position !== 'above' ? caption : null}
    </div>
    {template === 'carousel' && media.length > 1 ? <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{media.map((m: any, i: number) => <img key={i} src={m.url} alt={`Image ${i + 1}`} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />)}</div> : null}
    <div aria-hidden style={{ marginTop: 12, padding: 12, borderRadius: 99, background: 'var(--ay-e-accent-soft)', opacity: .7 }}>♡ · Commentaires · Partager · Enregistrer</div>
    <small>Prévisualisation de composition. Les compteurs réels sont affichés dans l’application. Carousel : 2–10 images ; modèle vidéo : fichier vidéo et couverture requis.</small>
  </figure>;
}
