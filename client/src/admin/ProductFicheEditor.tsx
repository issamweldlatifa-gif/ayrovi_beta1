/**
 * ÉDITEUR DE LA FICHE PRODUIT — le lieu unique où le propriétaire remplit un
 * produit et **voit avant de publier**.
 *
 * ── Ce que la maquette impose (jamais réglable ici) ─────────────────────────
 * Les cotes viennent de `ficheGeometry.ts`, copie verrouillée de
 * `apps/mobile/src/features/product/fiche.ts` (voir
 * `tests/fiche-geometry-parity.test.ts`) : hauteur de la photo, hauteur des
 * lignes, épaisseur des séparateurs, taille des vignettes, hauteur de la barre
 * d'achat et cotes du bouton. **Aucun champ de ce formulaire ne les touche.**
 *
 * ── Ce qui se règle ici, et arrive dans l'application ────────────────────────
 *  • le titre et la description ;
 *  • le **prix de vente** (`products.final_price`, la même colonne que publie
 *    `/api/public/products/:id`) ;
 *  • le **nom des blocs** : « Taille » peut devenir « Pointure », « Contenance »,
 *    « Volume »… et « Couleur » ce que le propriétaire veut ;
 *  • le **nom des sections** et **l'ajout d'une section** (les attributs du CRM) ;
 *  • un **champ quantité**, créé d'un clic s'il n'existe pas.
 *
 * Rien n'est écrit en dur côté application : tout ce panneau écrit dans
 * `catalogue_attribute_values` et `products.fiche_labels`, que la fiche lit.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Info, Palette, RotateCcw, Share2, Truck } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Field, Form, ImageUploader, Modal, Select } from './components';
import { FICHE_GEOMETRY, FICHE_LOCKS, FICHE_WIDTH } from './ficheGeometry';
import { colorTiles, ficheLabelsPayload, salePrice, tokenList, variantPlan } from './ficheDraft';

type ToastValue = { message: string; tone: 'success' | 'error' } | null;

interface Draft {
  name: string;
  slug: string;
  description: string;
  category_id: string;
  brand_id: string;
  status: string;
  product_type: string;
  image: string;
  final_price: string;
  stock_status: string;
  express_available: string;
}

const emptyDraft: Draft = {
  name: '', slug: '', description: '', category_id: '', brand_id: '', status: 'DRAFT',
  product_type: 'STANDARD', image: '', final_price: '', stock_status: '', express_available: 'false',
};

/** Libellés proposés : des mots techniques, pas une fantaisie — le propriétaire peut aussi écrire le sien. */
const SIZE_LABEL_HINTS = ['Taille', 'Pointure', 'Size', 'Contenance', 'Volume', 'Format'];
const COLOR_LABEL_HINTS = ['Couleur', 'Color', 'Teinte', 'Finition'];

/** Remplissages rapides : les grilles de tailles les plus courantes, pas une obligation. */
/** Sections proposées pour ranger un nouveau champ (le propriétaire peut en créer d'autres). */
const SECTION_SLUGS = ['pratique', 'matiere', 'mesures', 'technique', 'identite', 'beaute', 'specs'];

const SIZE_PRESETS = [
  { label: 'Chaussures 36 → 45', value: '36, 37, 38, 39, 40, 41, 42, 43, 44, 45' },
  { label: 'Chaussures 40 → 48,5', value: '40, 41, 42, 43, 44, 45, 46, 47, 48, 48.5' },
  { label: 'Vêtement XS → XXL', value: 'XS, S, M, L, XL, XXL' },
  { label: 'Unique', value: 'Taille unique' },
];

const rowsOf = (value: any): any[] => (Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : []);

/** « Champs libres » convertis en clé d'attribut : minuscules, chiffres et « _ ». */
function keyFrom(text: string, fallback: string): string {
  const key = String(text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z][a-z0-9_]*$/.test(key) ? key : fallback;
}

/* ── Aperçu : la fiche telle que l'application la dessine ──────────────────── */

interface PreviewInput {
  name: string;
  description: string;
  image: string;
  price: string;
  sizeLabel: string;
  sizeValue: string;
  colorLabel: string;
  /** Vignettes de couleur — vides quand une seule couleur est déclarée. */
  tiles: Array<{ color: string; image: string | null }>;
  selectedColor: string;
  sections: Array<{ slug: string; title: string; rows: Array<{ key: string; label: string; value: string }> }>;
  delivery: string | null;
  returns: string | null;
  ctaLabel: string;
}

const G = FICHE_GEOMETRY;

const FicheApercu: React.FC<{ input: PreviewInput }> = ({ input }) => {
  const price = input.price.trim() ? `${input.price.trim()} TND` : '';
  const dots = [0, 1, 2];

  return (
    <div className="fiche-phone" style={{ width: FICHE_WIDTH }}>
      <div className="fiche-phone__photo" style={{ height: G.imageHeight }}>
        {input.image
          ? <img src={input.image} alt="" />
          : <span className="fiche-phone__photo-empty">Photo du produit</span>}
        {dots.length > 1 ? (
          <div className="fiche-phone__dots" style={{ bottom: G.photoDotsBottom, gap: G.dotPitch - G.dot }}>
            {dots.map((index) => (
              <i
                key={index}
                className={index === 0 ? 'is-on' : ''}
                style={{ width: index === 0 ? G.dot : G.dotIdle, height: index === 0 ? G.dot : G.dotIdle }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="fiche-phone__identity" style={{ paddingTop: G.nameTop, paddingLeft: G.gutter, paddingRight: G.gutter }}>
        <div className="fiche-phone__identity-top">
          <span
            className="fiche-phone__name"
            style={{
              fontSize: G.nameSize,
              borderBottomWidth: G.underlineWidth,
              paddingBottom: G.underlineGap,
            }}
          >
            {input.name.trim() || 'Nom du produit'}
          </span>
          {price ? <span className="fiche-phone__price" style={{ fontSize: G.priceSize }}>{price}</span> : null}
        </div>
        {input.description.trim() ? (
          <p
            className="fiche-phone__description"
            style={{ fontSize: G.descriptionSize, lineHeight: `${G.descriptionLine}px`, marginTop: G.descriptionGap }}
          >
            {input.description.trim()}
          </p>
        ) : null}
      </div>

      <div style={{ height: G.ruleGap }} />
      <div className="fiche-phone__hair" style={{ height: G.hairline }} />

      {/* Ligne « Taille » — la cote et le chevron sont gelés, le libellé vient du CRM. */}
      <div className="fiche-phone__row" style={{ height: G.rowHeight, paddingLeft: G.rowIconStart, paddingRight: G.chevronEnd }}>
        <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><ArrowRightLeft size={G.rowIcon} /></span>
        <span className="fiche-phone__row-text" style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
          <b style={{ fontSize: G.rowLabel }}>{input.sizeLabel.trim() || 'Taille'}</b>
          {input.sizeValue ? <span style={{ fontSize: G.rowLabel }}>{input.sizeValue}</span> : null}
        </span>
        <span className="fiche-phone__chevron" />
      </div>

      <div className="fiche-phone__band" style={{ height: G.band }} />

      {input.tiles.length > 0 ? (
        <>
          <div style={{ paddingTop: G.blockTop, paddingBottom: G.blockBottom }}>
            <div
              className="fiche-phone__row"
              style={{ height: G.colorRowHeight, paddingLeft: G.rowIconStart, paddingRight: G.chevronEnd }}
            >
              <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><Palette size={G.rowIcon} /></span>
              <span className="fiche-phone__row-text" style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
                <b style={{ fontSize: G.colorLabel }}>{input.colorLabel.trim() || 'Couleur'}</b>
                <span style={{ fontSize: G.colorLabel, marginLeft: G.colorValueGap }}>{input.selectedColor}</span>
              </span>
            </div>
            <div className="fiche-phone__tiles" style={{ paddingLeft: G.gutter, paddingTop: G.tileTop, gap: G.tileGap }}>
              {input.tiles.map((tile) => {
                const active = tile.color === input.selectedColor;
                return (
                  <div key={tile.color} style={{ width: G.tileWidth }}>
                    <div className="fiche-phone__tile" style={{ width: G.tileWidth, height: G.tileHeight }}>
                      {tile.image
                        ? <img src={tile.image} alt="" />
                        : <span className="fiche-phone__tile-empty">{tile.color.slice(0, 2)}</span>}
                    </div>
                    <div
                      className="fiche-phone__tile-rule"
                      style={{ height: G.tileRule, backgroundColor: active ? 'var(--fiche-violet)' : 'transparent' }}
                    />
                    <span
                      className="fiche-phone__tile-label"
                      style={{ fontSize: G.tileLabel, marginTop: G.tileLabelGap, fontWeight: active ? 700 : 400 }}
                    >
                      {tile.color}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="fiche-phone__band" style={{ height: G.band }} />
        </>
      ) : null}

      {input.sections.map((section) => (
        <div key={section.slug}>
          <div className="fiche-phone__row" style={{ height: G.accordionHeight, paddingLeft: G.rowIconStart, paddingRight: G.chevronEnd }}>
            <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><Info size={G.rowIcon} /></span>
            <span className="fiche-phone__row-text" style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
              <b style={{ fontSize: G.accordionLabel }}>{section.title}</b>
            </span>
            <span className="fiche-phone__chevron" />
          </div>
          <div className="fiche-phone__hair" style={{ height: G.hairline }} />
        </div>
      ))}
      {input.sections.length > 0 ? <div className="fiche-phone__band" style={{ height: G.band }} /> : null}

      <div className="fiche-phone__info" style={{ paddingTop: G.infoTop, paddingLeft: G.rowIconStart, paddingRight: G.gutter }}>
        <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><Truck size={G.rowIcon} /></span>
        <div style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
          <b className="is-success" style={{ fontSize: G.infoTitle }}>Livraison rapide</b>
          {input.delivery ? <p style={{ fontSize: G.infoBody, lineHeight: `${G.infoLine}px` }}>{input.delivery}</p> : null}
        </div>
      </div>

      {input.returns ? (
        <div className="fiche-phone__info" style={{ paddingTop: G.infoTop, paddingLeft: G.rowIconStart, paddingRight: G.gutter }}>
          <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><RotateCcw size={G.rowIcon} /></span>
          <div style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
            <b style={{ fontSize: G.infoTitle }}>Retours gratuits</b>
            <p style={{ fontSize: G.infoBody, lineHeight: `${G.infoLine}px` }}>{input.returns}</p>
          </div>
        </div>
      ) : null}

      <div className="fiche-phone__band" style={{ height: G.band }} />

      <div className="fiche-phone__info" style={{ height: G.shareHeight, paddingTop: G.infoTop, paddingLeft: G.rowIconStart }}>
        <span className="fiche-phone__row-icon" style={{ width: G.rowIcon }}><Share2 size={G.rowIcon} /></span>
        <div style={{ marginLeft: G.rowLabelStart - G.rowIconStart - G.rowIcon }}>
          <b style={{ fontSize: G.rowLabel }}>Partager</b>
        </div>
      </div>
      <div className="fiche-phone__hair" style={{ height: G.underlineWidth }} />

      <div
        className="fiche-phone__bar"
        style={{ height: G.barHeight, paddingLeft: G.gutter, paddingRight: G.gutter - G.barButtonTop }}
      >
        <span style={{ fontSize: G.barPrice }}>{price || '—'}</span>
        <span
          className="fiche-phone__cta"
          style={{
            width: G.barButtonWidth,
            height: G.barButtonHeight,
            borderRadius: G.barButtonRadius,
            fontSize: G.barPrice,
          }}
        >
          {input.ctaLabel}
        </span>
      </div>
    </div>
  );
};

/* ── L'éditeur ─────────────────────────────────────────────────────────────── */

export const ProductFicheEditor: React.FC<{
  scope?: 'catalogue' | 'content';
  productId?: string | null;
  can: (resource: string, action: string) => boolean;
  categories: any[];
  brands: any[];
  declared: any[];
  reloadDeclared: () => void;
  onClose: (changed: boolean) => void;
  onToast: (value: ToastValue) => void;
}> = ({ scope = 'catalogue', productId = null, can, categories, brands, declared, reloadDeclared, onClose, onToast }) => {
  const base = scope === 'content' ? '/catalogue/content-products' : '/catalogue/products';
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sizeLabel, setSizeLabel] = useState('');
  const [colorLabel, setColorLabel] = useState('');
  const [sectionLabels, setSectionLabels] = useState<Record<string, string>>({});
  const [variants, setVariants] = useState<any[]>([]);
  const [colorPick, setColorPick] = useState('');
  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [byField, setByField] = useState<Record<string, string>>({});
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState({ title: '', field: '' });
  const [sectionBusy, setSectionBusy] = useState(false);
  const [quantityOpen, setQuantityOpen] = useState(false);
  const [sizesText, setSizesText] = useState('');
  const [colorsText, setColorsText] = useState('');
  const [variantBusy, setVariantBusy] = useState(false);
  const [quantityForm, setQuantityForm] = useState({ label: 'Quantité', value: '', section: 'pratique' });

  const productAttributes = useMemo(
    () => rowsOf(declared).filter((entry) => entry.applies_to === 'product'),
    [declared],
  );

  const load = useCallback(async () => {
    if (!productId) { setLoading(false); return; }
    setLoading(true);
    try {
      const full = (await adminApi<any>(`${base}/${productId}`)).data;
      setDraft({
        name: full.name || '', slug: full.slug || '', description: full.description || '',
        category_id: full.category_id || '', brand_id: full.brand_id || '',
        status: full.status || 'DRAFT', product_type: full.product_type || 'STANDARD',
        image: full.image || '',
        final_price: full.final_price === null || full.final_price === undefined ? '' : String(full.final_price),
        stock_status: full.stock_status || '',
        express_available: Number(full.express_available) === 1 ? 'true' : 'false',
      });
      setValues(full.attributes || {});
      const labels = full.fiche_labels || {};
      setSizeLabel(String(labels.size ?? ''));
      setColorLabel(String(labels.color ?? ''));
      setSectionLabels(labels.sections || {});
      const list = Array.isArray(full.variants) ? full.variants : [];
      setVariants(list);
      setSizesText([...new Set(list.map((variant: any) => String(variant.size ?? '').trim()).filter(Boolean))].join(', '));
      setColorsText([...new Set(list.map((variant: any) => String(variant.color ?? '').trim()).filter(Boolean))].join(', '));
      const firstColor = list.map((variant: any) => String(variant.color ?? '').trim()).filter(Boolean)[0];
      setColorPick(firstColor || '');
      setError('');
    } catch (exception: any) {
      setError(exception?.message || 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, [base, productId]);

  useEffect(() => { void load(); }, [load]);

  /** Sections affichées = celles qui ont un nom, un champ, ou une valeur. */
  const sections = useMemo(() => {
    const known = new Map<string, { slug: string; title: string; rows: Array<{ key: string; label: string; value: string }> }>();
    const push = (slug: string, key: string, label: string, value: string) => {
      if (!slug) return;
      const entry = known.get(slug) ?? { slug, title: sectionLabels[slug] || defaultSectionTitle(slug), rows: [] };
      if (key && !entry.rows.some((row) => row.key === key)) entry.rows.push({ key, label, value });
      known.set(slug, entry);
    };
    for (const attribute of productAttributes) {
      const key = String(attribute.attribute_key ?? '');
      if (!key) continue;
      const value = String(values[key] ?? '');
      // Un attribut sans section tombe dans « Caractéristiques » : il reste
      // éditable, sinon il disparaîtrait du seul écran qui peut le remplir.
      const slug = String(attribute.section ?? '').trim() || 'specs';
      // Un champ vide est un champ à remplir : il apparaît, la fiche ne l'affichera
      // que le jour où il aura une valeur.
      push(slug, key, String(attribute.label ?? key), value);
    }
    for (const [slug, label] of Object.entries(sectionLabels)) {
      if (!known.has(slug)) known.set(slug, { slug, title: label || defaultSectionTitle(slug), rows: [] });
    }
    return [...known.values()];
  }, [productAttributes, values, sectionLabels]);

  /** Tailles de la fiche = la saisie + les variantes déjà enregistrées. */
  const sizes = useMemo(() => {
    const list = tokenList(sizesText);
    for (const variant of variants) {
      const size = String(variant?.size ?? '').trim();
      if (size && !list.some((value) => value.toLowerCase() === size.toLowerCase())) list.push(size);
    }
    return list;
  }, [sizesText, variants]);

  const colors = useMemo(() => {
    const list = tokenList(colorsText);
    for (const variant of variants) {
      const color = String(variant?.color ?? '').trim();
      if (color && !list.some((value) => value.toLowerCase() === color.toLowerCase())) list.push(color);
    }
    return list;
  }, [colorsText, variants]);

  /** Une seule taille ⇒ la valeur s'écrit sur la ligne « Taille » (cote de la maquette). */
  const sizeValue = sizes.length === 1 ? sizes[0] : '';

  const save = async (publish = false) => {
    setSaving(true);
    setError(''); setByField({});
    const body: Record<string, unknown> = {
      name: draft.name,
      description: draft.description.trim() ? draft.description : null,
      slug: draft.slug.trim() ? draft.slug : null,
      brand_id: draft.brand_id || null,
      category_id: draft.category_id || null,
      status: publish ? 'ACTIVE' : draft.status,
      product_type: draft.product_type,
      image: draft.image.trim() ? draft.image : null,
      stock_status: draft.stock_status || null,
      express_available: draft.express_available === 'true',
      currency: 'TND',
      // Le PRIX DE VENTE affiché par la fiche : la même colonne que publie l'API.
      final_price: salePrice(draft.final_price) ?? 0,
      fiche_labels: ficheLabelsPayload(sizeLabel, colorLabel, sectionLabels),
      attributes: values,
    };
    // Publier une fiche sans prix, c'est publier un article qui ne peut pas
    // entrer au panier (`NO_PRICE`) : on refuse ici, avec le bon mot.
    if (publish && salePrice(draft.final_price) === null) {
      setError('Un prix de vente supérieur à 0 est requis pour publier.');
      setSaving(false);
      return;
    }
    try {
      const id = productId
        ? (await adminApi(`${base}/${productId}`, { method: 'PUT', body: JSON.stringify(body) }), productId)
        : (await adminApi<any>(base, { method: 'POST', body: JSON.stringify(body) })).data?.id;
      // Les tailles et les couleurs deviennent des variantes : sans elles, la
      // fiche n'affiche ni ligne « Taille » ni bloc couleur — et rien ne se
      // commande avec la bonne taille.
      let created = 0;
      if (id && scope === 'catalogue') {
        const plan = variantPlan(variants, sizes, colors, draft.slug.trim() || draft.name);
        if (plan.length > 0) {
          setVariantBusy(true);
          const added: any[] = [];
          for (const entry of plan) {
            const variant = (await adminApi<any>(`${base}/${id}/variants`, {
              method: 'POST',
              body: JSON.stringify({ sku: entry.sku, size: entry.size || null, color: entry.color || null, status: 'ACTIVE', position: 100 }),
            })).data;
            if (variant) added.push(variant);
            created += 1;
          }
          // L'état local suit : un second enregistrement ne recrée pas ces SKU.
          if (added.length > 0) setVariants((current) => [...current, ...added]);
          setVariantBusy(false);
        }
      }
      onToast({
        message: publish
          ? `Produit publié : la fiche est visible sur l’application${created > 0 ? ` (${created} SKU créés)` : ''}.`
          : `Produit enregistré${created > 0 ? ` — ${created} SKU créés` : ''}.`,
        tone: 'success',
      });
      onClose(true);
    } catch (exception: any) {
      const parsed = exception?.body?.errors;
      if (Array.isArray(parsed)) {
        setByField(Object.fromEntries(parsed.map((entry: any) => [entry.field, entry.reason || 'Refusé'])));
      }
      setError(exception?.message || 'Enregistrement refusé.');
    } finally {
      setSaving(false);
    }
  };

  /** Crée un attribut (une section, un champ) puis rafraîchit la liste déclarée. */
  const createAttribute = async (input: { key: string; label: string; section: string; type?: string }) => {
    await adminApi('/catalogue/attributes', {
      method: 'POST',
      body: JSON.stringify({
        attribute_key: input.key,
        label: input.label,
        data_type: input.type ?? 'TEXT',
        target: 'product',
        section: input.section,
        families: [],
        sort_order: 240,
      }),
    });
    reloadDeclared();
  };

  const addSection = async () => {
    const title = sectionForm.title.trim();
    const field = sectionForm.field.trim() || title;
    if (!title) return;
    setSectionBusy(true); setError('');
    try {
      const slug = keyFrom(title, 'section');
      const key = keyFrom(field, `${slug}_valeur`);
      const exists = productAttributes.some((attribute) => attribute.attribute_key === key);
      if (!exists) await createAttribute({ key, label: field, section: slug });
      setSectionLabels((current) => ({ ...current, [slug]: title }));
      setSectionForm({ title: '', field: '' });
      setSectionOpen(false);
      onToast({ message: `Section « ${title} » ajoutée à la fiche.`, tone: 'success' });
    } catch (exception: any) {
      setError(exception?.message || 'Ajout de section refusé.');
    } finally {
      setSectionBusy(false);
    }
  };

  const addQuantity = async () => {
    setSectionBusy(true); setError('');
    try {
      const label = quantityForm.label.trim() || 'Quantité';
      const section = quantityForm.section.trim() || 'pratique';
      const exists = productAttributes.some((attribute) => attribute.attribute_key === 'quantity');
      if (!exists) await createAttribute({ key: 'quantity', label, section, type: 'TEXT' });
      if (quantityForm.value.trim()) setValues((current) => ({ ...current, quantity: quantityForm.value.trim() }));
      setQuantityOpen(false);
      onToast({ message: `Champ « ${label} » ajouté à la section « ${sectionLabels[section] || defaultSectionTitle(section)} ».`, tone: 'success' });
    } catch (exception: any) {
      setError(exception?.message || 'Ajout du champ refusé.');
    } finally {
      setSectionBusy(false);
    }
  };

  const canPublish = can('product', 'approve');

  if (loading) {
    return (
      <div className="fiche-editor">
        <div className="fiche-editor__bar">
          <Button variant="ghost" onClick={() => onClose(false)}>← Retour aux produits</Button>
        </div>
        <p className="admin-block-small" style={{ padding: 24 }}>Lecture du produit…</p>
      </div>
    );
  }

  return (
    <div className="fiche-editor">
      <header className="fiche-editor__bar">
        <Button variant="ghost" onClick={() => onClose(false)}>← Produits</Button>
        <div className="fiche-editor__title">
          <span>FICHE PRODUIT</span>
          <strong>{draft.name.trim() || 'Nouveau produit'}</strong>
        </div>
        <div className="fiche-editor__actions">
          <span className={`fiche-editor__status is-${(draft.status || 'DRAFT').toLowerCase()}`}>{draft.status}</span>
          <Button variant="secondary" busy={saving || variantBusy} onClick={() => void save(false)}>Enregistrer</Button>
          {canPublish ? (
            <Button busy={saving || variantBusy} onClick={() => void save(true)}>Publier</Button>
          ) : null}
        </div>
      </header>

      {error ? <p className="admin-field-error fiche-editor__error">{error}</p> : null}

      <div className="fiche-editor__grid">
        <div className="fiche-editor__form">
          <Form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
            {/* 1. Les cotes de la maquette : lisibles, jamais réglables. */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head">
                <h2>Cadre de la maquette</h2>
                <span className="fiche-editor__lock">Verrouillé</span>
              </header>
              <p className="admin-block-small">
                Ces mesures viennent de la maquette validée. Elles ne se règlent pas ici : ce panneau
                ne change que le CONTENU de la fiche (noms, prix, sections).
              </p>
              <ul className="fiche-locks">
                {FICHE_LOCKS.map((lock) => (
                  <li key={lock.label}><span>{lock.label}</span><strong>{lock.value}</strong></li>
                ))}
              </ul>
            </section>

            {/* 2. Identité */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head"><h2>Produit</h2></header>
              <div className="admin-form-row">
                <Field label="Nom" required full error={byField.name}>
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
                </Field>
              </div>
              <Field label="Description courte" hint="Deux lignes sous le nom, dans la fiche." error={byField.description}>
                <textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </Field>
              <div className="admin-form-row">
                <Field label="Catégorie" error={byField.category_id}>
                  <Select
                    value={draft.category_id}
                    onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}
                    options={[{ value: '', label: '— non classé —' }, ...categories.map((row) => ({ value: row.id, label: `${'— '.repeat(Number(row.depth || 0))}${row.name}` }))]}
                  />
                </Field>
                <Field label="Marque" error={byField.brand_id}>
                  <Select
                    value={draft.brand_id}
                    onChange={(event) => setDraft({ ...draft, brand_id: event.target.value })}
                    options={[{ value: '', label: '— sans marque —' }, ...brands.map((row) => ({ value: row.id, label: row.name }))]}
                  />
                </Field>
              </div>
              <Field label="Photo principale" full hint="La photo remplit la zone de 581 dp. Aucun réglage de taille : la cote est celle de la maquette.">
                <ImageUploader value={draft.image} onChange={(value) => setDraft({ ...draft, image: value })} />
              </Field>
            </section>

            {/* 3. Prix */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head"><h2>Prix</h2></header>
              <div className="admin-form-row">
                <Field label="Prix de vente (TND)" required hint="Le prix affiché sur la fiche, tel quel. Pas de prix barré, pas de remise." error={byField.final_price}>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={draft.final_price}
                    onChange={(event) => setDraft({ ...draft, final_price: event.target.value })}
                  />
                </Field>
              </div>
            </section>

            {/* 4. Tailles et couleurs : le contenu de la ligne « Taille » et des vignettes */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head"><h2>Tailles et couleurs</h2></header>
              <p className="admin-block-small">
                Chaque taille devient un SKU : c’est ce que la feuille de la fiche affiche, et ce que
                le client choisit avant d’ajouter au panier. Les tailles déjà enregistrées restent.
              </p>
              <div className="admin-form-row">
                <div>
                  <Field label="Tailles" hint="Séparées par une virgule : 39, 40, 41">
                    <input value={sizesText} onChange={(event) => setSizesText(event.target.value)} placeholder="39, 40, 41, 42" />
                  </Field>
                  <span className="fiche-hints">
                    {SIZE_PRESETS.map((preset) => (
                      <button type="button" key={preset.label} onClick={() => setSizesText(preset.value)}>{preset.label}</button>
                    ))}
                  </span>
                </div>
                <div>
                  <Field label="Couleurs" hint="Vide = pas de bloc couleur sur la fiche.">
                    <input value={colorsText} onChange={(event) => setColorsText(event.target.value)} placeholder="Gris, Noire" />
                  </Field>
                  <span className="fiche-hints">
                    {variants.length > 0 ? <em>{variants.length} SKU enregistrés</em> : null}
                  </span>
                </div>
              </div>
            </section>

            {/* 5. Noms des blocs */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head"><h2>Noms des blocs</h2></header>
              <p className="admin-block-small">
                Le nom écrit ici remplace celui de l’application sur toutes les fiches de ce produit.
              </p>
              <div className="admin-form-row">
                <div>
                  <Field label="Bloc des tailles" hint="Taille, Pointure, Size, Contenance, Volume…">
                    <input value={sizeLabel} placeholder="Taille" onChange={(event) => setSizeLabel(event.target.value)} />
                  </Field>
                  <span className="fiche-hints">
                    {SIZE_LABEL_HINTS.map((hint) => (
                      <button type="button" key={hint} onClick={() => setSizeLabel(hint)} className={sizeLabel === hint ? 'is-on' : ''}>{hint}</button>
                    ))}
                  </span>
                </div>
                <div>
                  <Field label="Bloc des couleurs" hint="Couleur, Color, Teinte, Finition…">
                    <input value={colorLabel} placeholder="Couleur" onChange={(event) => setColorLabel(event.target.value)} />
                  </Field>
                  <span className="fiche-hints">
                    {COLOR_LABEL_HINTS.map((hint) => (
                      <button type="button" key={hint} onClick={() => setColorLabel(hint)} className={colorLabel === hint ? 'is-on' : ''}>{hint}</button>
                    ))}
                  </span>
                </div>
              </div>
            </section>

            {/* 5. Sections et champs */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head">
                <h2>Sections de la fiche</h2>
                <div className="admin-row-actions">
                  <Button type="button" variant="secondary" onClick={() => setQuantityOpen(true)}>Champ quantité</Button>
                  <Button type="button" variant="secondary" onClick={() => setSectionOpen(true)}>Ajouter une section</Button>
                </div>
              </header>
              <p className="admin-block-small">
                Chaque section devient un accordéon (48 dp, cote de la maquette). Un champ vide ne
                s’affiche pas sur l’application : la fiche ne montre jamais de ligne sans valeur.
              </p>
              {sections.length === 0 ? (
                <p className="admin-block-small">
                  Aucun champ déclaré. « Ajouter une section » crée la section ET son premier champ.
                </p>
              ) : sections.map((section) => (
                <div key={section.slug} className="fiche-section">
                  <div className="fiche-section__head">
                    <input
                      className="fiche-section__title"
                      value={sectionLabels[section.slug] ?? section.title}
                      placeholder={defaultSectionTitle(section.slug)}
                      onChange={(event) => setSectionLabels({ ...sectionLabels, [section.slug]: event.target.value })}
                    />
                    <code>{section.slug}</code>
                  </div>
                  <div className="fiche-section__rows">
                    {section.rows.map((row) => (
                      <label key={row.key}>
                        <span>{row.label}</span>
                        <input
                          value={values[row.key] ?? ''}
                          onChange={(event) => setValues({ ...values, [row.key]: event.target.value })}
                          placeholder="Valeur"
                        />
                      </label>
                    ))}
                    {section.rows.length === 0 ? <p className="admin-block-small">Aucun champ dans cette section.</p> : null}
                  </div>
                </div>
              ))}
            </section>

            {/* 6. Publication */}
            <section className="fiche-editor__block">
              <header className="fiche-editor__block-head"><h2>Publication</h2></header>
              <div className="admin-form-row">
                <Field label="Statut" hint="DRAFT reste interne ; ACTIVE publie (droit catalog:approve)." error={byField.status}>
                  <Select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                    options={[{ value: 'DRAFT', label: 'DRAFT' }, { value: 'ACTIVE', label: 'ACTIVE' }, { value: 'ARCHIVED', label: 'ARCHIVED' }]}
                  />
                </Field>
                <Field label="Slug" hint="Vide = généré depuis le nom." error={byField.slug}>
                  <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="baskets-route-homme" />
                </Field>
              </div>
            </section>
          </Form>
        </div>

        {/* L'aperçu : la géométrie de l'application, le contenu du formulaire. */}
        <aside className="fiche-editor__preview">
          <div className="fiche-editor__preview-head">
            <h2>Aperçu avant publication</h2>
            <span>{FICHE_WIDTH} × {G.imageHeight + G.rowHeight + G.band + G.barHeight} dp · cotes gelées</span>
          </div>
          <div className="fiche-editor__phone-wrap">
            <FicheApercu
              input={{
                name: draft.name,
                description: draft.description,
                image: draft.image,
                price: draft.final_price,
                sizeLabel,
                sizeValue,
                colorLabel,
                tiles: colorTiles(colors),
                selectedColor: colorPick,
                sections: sections
                  .map((section) => ({ ...section, rows: section.rows.filter((row) => row.value.trim()) }))
                  .filter((section) => section.rows.length > 0),
                delivery: null,
                returns: null,
                ctaLabel: 'Ajouter au panier',
              }}
            />
          </div>
          <p className="admin-block-small">
            L’aperçu utilise les mêmes cotes que l’application. Les dates de livraison et la fenêtre de
            retour viennent des réglages du CRM, elles ne se saisissent pas produit par produit.
          </p>
        </aside>
      </div>

      <Modal open={sectionOpen} title="Ajouter une section" onClose={() => setSectionOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setSectionOpen(false)}>Annuler</Button>
          <Button busy={sectionBusy} onClick={() => void addSection()}>Ajouter</Button>
        </>}
      >
        <p className="admin-block-small">
          La section devient un accordéon de la fiche. Son nom est celui que vous écrivez ici —
          et son premier champ devient une ligne de cet accordéon.
        </p>
        <div className="admin-form-row">
          <Field label="Nom de la section" required hint="Ex. Matière recyclée, Entretien, Contenance">
            <input value={sectionForm.title} onChange={(event) => setSectionForm({ ...sectionForm, title: event.target.value })} required />
          </Field>
          <Field label="Premier champ" hint="Ex. Composition (vide = le nom de la section)">
            <input value={sectionForm.field} onChange={(event) => setSectionForm({ ...sectionForm, field: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={quantityOpen} title="Champ quantité" onClose={() => setQuantityOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setQuantityOpen(false)}>Annuler</Button>
          <Button busy={sectionBusy} onClick={() => void addQuantity()}>Ajouter le champ</Button>
        </>}
      >
        <p className="admin-block-small">
          Le champ est créé une seule fois pour tous les produits, puis rempli produit par produit.
        </p>
        <div className="admin-form-row">
          <Field label="Libellé du champ" hint="Le nom affiché sur la fiche.">
            <input value={quantityForm.label} onChange={(event) => setQuantityForm({ ...quantityForm, label: event.target.value })} />
          </Field>
          <Field label="Valeur pour ce produit" hint="Vide = le champ existe mais ne s'affiche pas.">
            <input value={quantityForm.value} onChange={(event) => setQuantityForm({ ...quantityForm, value: event.target.value })} />
          </Field>
          <Field label="Section d’accueil" hint="L’accordéon qui contiendra ce champ.">
            <Select
              value={quantityForm.section}
              onChange={(event) => setQuantityForm({ ...quantityForm, section: event.target.value })}
              options={SECTION_SLUGS.map((slug) => ({ value: slug, label: sectionLabels[slug] || defaultSectionTitle(slug) }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

/** Nom par défaut d'une section : celui de l'application quand le slug est connu. */
function defaultSectionTitle(slug: string): string {
  switch (slug) {
    case 'identite': return 'Identité';
    case 'matiere': return 'Matière et entretien';
    case 'mesures': return 'Taille et mesures';
    case 'technique': return 'Caractéristiques techniques';
    case 'beaute': return 'Beauté et soin';
    case 'pratique': return 'Garantie et livraison';
    case 'specs': return 'Caractéristiques';
    default: return slug.replace(/_/g, ' ');
  }
}
