import type { ReactNode } from 'react';
import { STORY_EDITORIAL_LIMITS as LIMITS, type StoryArticle, type StoryArticleBlock, type StoryEditorial, type StoryLocalizedText, type StorySlide } from '../../../shared/storyEditorial';
import { StudioMediaField } from './StudioMediaField';
import { Button, Field } from './components';

const empty = () => ({ text: '' });
const frame = (url: string, layout: StorySlide['layout'] = 'cover'): StorySlide => ({ layout, media: { kind: 'image', url }, title: empty(), caption: empty() });
const article = (cover: string): StoryArticle => ({ cover, title: empty(), intro: empty(), author: '', blocks: [], selectionTitle: empty() });
function move<T>(rows: T[], index: number, offset: number) {
  if (index + offset < 0 || index + offset >= rows.length) return rows;
  const list = [...rows];
  [list[index], list[index + offset]] = [list[index + offset]!, list[index]!];
  return list;
}

function Localized({ label, value, max = 180, multiline, onChange }: {
  label: string; value: StoryLocalizedText; max?: number; multiline?: boolean; onChange: (value: StoryLocalizedText) => void;
}) {
  return <>{(['text', 'textAr'] as const).map(key => {
    const props = { value: value[key] || '', maxLength: max, dir: key === 'textAr' ? 'rtl' : 'ltr',
      onChange: (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value }) };
    return <Field key={key} label={`${label} ${key === 'textAr' ? 'AR' : 'FR'}`} full>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
    </Field>;
  })}</>;
}

export function StorySequenceEditor({ value, cover, productIds, onChange, upload }: {
  value: StoryEditorial | null; cover: string; productIds: string[]; onChange: (value: StoryEditorial | null) => void;
  upload: (file: File, onChange: (url: string) => void) => void;
}) {
  if (!value) return <section aria-label="Parcours Stories"><Button type="button" onClick={() => onChange({ version: 1,
    slides: [{ ...frame(cover), action: 'read' }, { ...frame(cover, 'inset'), action: 'read' }], article: article(cover) })}>Créer un parcours éditorial</Button></section>;
  const selection = value.article;
  const updateArticle = (next: StoryArticle) => onChange({ ...value, article: next });
  const update = (index: number, slide: StorySlide) => onChange({ ...value, slides: value.slides.map((item, i) => i === index ? slide : item) });
  const updateBlock = (index: number, block: StoryArticleBlock) => selection && updateArticle({ ...selection, blocks: selection.blocks.map((current, i) => i === index ? block : current) });
  const controls = (index: number, length: number, onMove: (offset: number) => void, remove: () => void, removable = true): ReactNode => <div className="admin-actions">
    <Button type="button" disabled={index === 0} onClick={() => onMove(-1)}>Monter</Button>
    <Button type="button" disabled={index + 1 >= length} onClick={() => onMove(1)}>Descendre</Button>
    <Button type="button" variant="danger" disabled={!removable} onClick={remove}>Retirer</Button>
  </div>;
  return <section aria-label="Parcours Stories (nouveau format)">
    <h3>Parcours Stories</h3>
    <p>Une carte ouvre ces écrans dans l’ordre. Les boutons Lire et Découvrir ouvrent l’article de cette carte. Un écran Produit présente un article associé ci-dessus.</p>
    {value.slides.map((slide, i) => <section key={i} className="admin-card">
      <h4>Écran {i + 1}</h4>
      {controls(i, value.slides.length, offset => onChange({ ...value, slides: move(value.slides, i, offset) }),
        () => onChange({ ...value, slides: value.slides.filter((_, index) => index !== i) }), value.slides.length > 1)}
      <Field label="Mise en page"><select value={slide.layout} onChange={e => {
        const layout = e.target.value as StorySlide['layout'];
        update(i, { ...slide, layout, action: layout === 'product' ? undefined : slide.action, productId: layout === 'product' ? productIds[0] : undefined });
      }}><option value="cover">Plein écran</option><option value="inset">Média encadré + texte</option><option value="product">Plein écran + produit</option></select></Field>
      <Field label="Média"><select value={slide.media.kind} onChange={e => update(i, { ...slide, media: { kind: e.target.value as StorySlide['media']['kind'], url: '' } })}>
        <option value="image">Photo</option><option value="video">Vidéo</option><option value="gif">GIF animé</option>
      </select></Field>
      <StudioMediaField label="Fichier de l’écran" kind={slide.media.kind} value={slide.media.url} upload={upload} onChange={url => update(i, { ...slide, media: { ...slide.media, url } })} />
      {slide.media.kind === 'video' ? <StudioMediaField label="Image d’attente (facultative)" value={slide.media.poster || ''} upload={upload}
        onChange={poster => update(i, { ...slide, media: { ...slide.media, poster } })} /> : null}
      <Localized label="Titre" value={slide.title} onChange={title => update(i, { ...slide, title })} />
      <Localized label="Texte" value={slide.caption} max={420} multiline onChange={caption => update(i, { ...slide, caption })} />
      <Field label="Durée (secondes, facultative)"><input type="number" min={3} max={60} value={slide.seconds ?? ''}
        onChange={e => update(i, { ...slide, seconds: e.target.value ? Number(e.target.value) : undefined })} /></Field>
      {slide.layout === 'product' ? <Field label="Produit de cet écran"><select value={slide.productId || ''} onChange={e => update(i, { ...slide, productId: e.target.value })}>
        <option value="">Choisir un produit associé</option>{productIds.map(id => <option key={id} value={id}>{id}</option>)}
      </select></Field> : <Field label="Bouton"><select value={slide.action || ''} onChange={e => {
        const action = (e.target.value || undefined) as StorySlide['action'];
        onChange({ ...value, slides: value.slides.map((entry, index) => index === i ? { ...slide, action } : entry), article: selection || (action ? article(cover) : undefined) });
      }}><option value="">Aucun</option><option value="read">Lire</option><option value="discover">Découvrir</option></select></Field>}
    </section>)}
    <Button type="button" disabled={value.slides.length >= LIMITS.slides} onClick={() => onChange({ ...value, slides: [...value.slides, frame(cover)] })}>Ajouter un écran</Button>
    {selection ? <section className="admin-card">
      <h4>Article de cette carte</h4>
      <StudioMediaField label="Image principale" value={selection.cover} upload={upload} onChange={cover => updateArticle({ ...selection, cover })} />
      <Localized label="Titre" value={selection.title} onChange={title => updateArticle({ ...selection, title })} />
      <Localized label="Introduction" max={1200} multiline value={selection.intro} onChange={intro => updateArticle({ ...selection, intro })} />
      <Field label="Auteur (facultatif)"><input maxLength={100} value={selection.author} onChange={e => updateArticle({ ...selection, author: e.target.value })} /></Field>
      <Localized label="Titre de la sélection de produits" value={selection.selectionTitle} max={150} onChange={selectionTitle => updateArticle({ ...selection, selectionTitle })} />
      {selection.blocks.map((block, index) => <section className="admin-card" key={index}>
        <h5>{index + 1}. {block.type === 'image' ? 'Image' : 'Paragraphe'}</h5>
        {controls(index, selection.blocks.length, offset => updateArticle({ ...selection, blocks: move(selection.blocks, index, offset) }),
          () => updateArticle({ ...selection, blocks: selection.blocks.filter((_, i) => i !== index) }))}
        {block.type === 'text' ? <Localized label="Paragraphe" value={block.content} max={3000} multiline onChange={content => updateBlock(index, { ...block, content })} /> : <>
          <StudioMediaField label="Photo du paragraphe" value={block.url} upload={upload} onChange={url => updateBlock(index, { ...block, url })} />
          <Localized label="Description de l’image" value={block.alt} onChange={alt => updateBlock(index, { ...block, alt })} />
        </>}
      </section>)}
      <div className="admin-actions">
        <Button type="button" disabled={selection.blocks.length >= LIMITS.blocks} onClick={() => updateArticle({ ...selection, blocks: [...selection.blocks, { type: 'text', content: empty() }] })}>Ajouter un paragraphe</Button>
        <Button type="button" disabled={selection.blocks.length >= LIMITS.blocks} onClick={() => updateArticle({ ...selection, blocks: [...selection.blocks, { type: 'image', url: '', alt: empty() }] })}>Ajouter une image</Button>
        <Button type="button" variant="danger" onClick={() => onChange({ ...value, article: undefined, slides: value.slides.map(slide => ({ ...slide, action: undefined })) })}>Retirer l’article</Button>
      </div>
    </section> : null}
    <Button type="button" variant="danger" onClick={() => { if (window.confirm('Retirer le parcours personnalisé ? La carte et les produits resteront enregistrés.')) onChange(null); }}>Retirer le parcours</Button>
  </section>;
}
