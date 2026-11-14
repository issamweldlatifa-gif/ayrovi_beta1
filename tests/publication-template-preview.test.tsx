import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicationTemplatePreview } from '../client/src/admin/PublicationTemplatePreview';
describe('Publication CRM previews match the new unclipped mobile compositions', () => {
  it.each(['photo', 'split', 'campaign', 'carousel'])(
    '%s keeps authored media, full-width copy and real CTA without squeezed columns or overlays',
    (template) => {
      const html = renderToStaticMarkup(
        <PublicationTemplatePreview
          form={{
            template_id: template,
            title: 'Un titre éditorial complet',
            description: 'Une description réelle.',
            action_label: 'Découvrir',
            image_url: '/real-photo.jpg',
            media: [
              { type: 'image', url: '/first.jpg' },
              { type: 'image', url: '/second.jpg' },
            ],
          }}
        />
      );
      expect(html).toContain('Un titre éditorial complet');
      expect(html).toContain('Une description réelle.');
      expect(html).toContain('Découvrir');
      expect(html).toContain('/first.jpg');
      expect(html).not.toContain('grid-template-columns');
      expect(html).not.toContain('position:absolute');
      expect(html).not.toContain('3/5');
      expect(html.indexOf('Une description réelle.')).toBeLessThan(
        html.indexOf('src="/first.jpg"')
      );
      expect(html.indexOf('src="/first.jpg"')).toBeLessThan(
        html.indexOf('Découvrir')
      );
    }
  );
});

it('renders the actual editorial hierarchy, warm plate and landscape hero rather than a generic caption', () => {
  const html = renderToStaticMarkup(
    <PublicationTemplatePreview
      form={{
        template_id: 'campaign',
        category: 'beauty',
        title: 'Votre nouveau rituel.',
        description: 'Une touche de couleur.',
        action_label: 'Découvrir la sélection',
        media: [
          {
            url: '/media/publications/editorial-beauty-mirror.jpg',
            type: 'image',
          },
        ],
      }}
    />
  );
  expect(html).toContain('font-size:32px');
  expect(html).toContain('#F4F1EA');
  expect(html).toContain('aspect-ratio:1.5');
  expect(html).toContain('BEAUTÉ');
});
it('places carousel copy above its first media preview without obsolete commercial blocks', () => {
  const html = renderToStaticMarkup(
    <PublicationTemplatePreview
      form={{
        template_id: 'carousel',
        title: 'Les essentiels de saison',
        description: 'Trois pièces, une allure.',
        media: [
          { url: '/first-bag.jpg' },
          { url: '/second-bag.jpg' },
          { url: '/third-bag.jpg' },
        ],
        products: [
          {
            id: 'catalogue-bag',
            name: 'Sac catalogue',
            image: '/catalogue.jpg',
            price: 149,
            currency: 'TND',
          },
        ],
      }}
    />
  );
  expect(html.indexOf('Les essentiels de saison')).toBeLessThan(
    html.indexOf('src="/first-bag.jpg"')
  );
  expect(html).not.toContain('Voir le produit');
  expect(html).not.toContain('Sac catalogue');
  expect(html).not.toContain('src="/third-bag.jpg"');
});

it.each([
  'photo',
  'split',
  'campaign',
  'carousel',
  'video',
  'social_mosaic',
  'social_pair',
  'social_strip',
  'caption_photo',
  'shoppable',
])(
  '%s keeps its description above media despite legacy below metadata',
  (template) => {
    const html = renderToStaticMarkup(
      <PublicationTemplatePreview
        form={{
          template_id: template,
          title: 'Titre interne',
          description: 'Texte au-dessus',
          description_position: 'below',
          action_label: 'Explorer la sélection',
          media: [
            { type: 'image', url: '/source.jpg' },
            { type: 'image', url: '/second.jpg' },
          ],
        }}
      />
    );
    expect(html.indexOf('Texte au-dessus')).toBeLessThan(
      html.indexOf('src="/source.jpg"')
    );
    expect(html.indexOf('src="/source.jpg"')).toBeLessThan(
      html.indexOf('Explorer la sélection')
    );
    expect(html).toContain('#0A63F5');
  }
);
