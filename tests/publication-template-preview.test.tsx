import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicationTemplatePreview } from '../client/src/admin/PublicationTemplatePreview';
describe('Publication CRM previews match the new unclipped mobile compositions', () => {
  it.each(['photo','split','campaign','carousel'])('%s keeps authored media, full-width copy and real CTA without squeezed columns or overlays', template => {
    const html=renderToStaticMarkup(<PublicationTemplatePreview form={{template_id:template,title:'Un titre éditorial complet',description:'Une description réelle.',action_label:'Découvrir',image_url:'/real-photo.jpg',media:[{type:'image',url:'/first.jpg'},{type:'image',url:'/second.jpg'}]}} />);
    expect(html).toContain('Un titre éditorial complet');expect(html).toContain('Une description réelle.');expect(html).toContain('Découvrir');expect(html).toContain('/first.jpg');
    expect(html).not.toContain('grid-template-columns');expect(html).not.toContain('position:absolute');expect(html).not.toContain('3/5');
    if(template==='carousel')expect(html).toContain('/second.jpg');
  });
});

it('renders the actual editorial hierarchy, warm plate and landscape hero rather than a generic caption',()=>{
 const html=renderToStaticMarkup(<PublicationTemplatePreview form={{template_id:'campaign',category:'beauty',title:'Votre nouveau rituel.',description:'Une touche de couleur.',action_label:'Découvrir la sélection',media:[{url:'/media/publications/editorial-beauty-mirror.jpg',type:'image'}]}}/>);
 expect(html).toContain('font-size:32px');expect(html).toContain('#F4F1EA');expect(html).toContain('aspect-ratio:1.5');expect(html).toContain('BEAUTÉ');
});
it('places large carousel thumbnails before its copy, then the actual linked product before reactions',()=>{
 const html=renderToStaticMarkup(<PublicationTemplatePreview form={{template_id:'carousel',title:'Les essentiels de saison',description:'Trois pièces, une allure.',media:[{url:'/first-bag.jpg'},{url:'/second-bag.jpg'},{url:'/third-bag.jpg'}],products:[{id:'catalogue-bag',name:'Sac catalogue',image:'/catalogue.jpg',price:149,currency:'TND'}]}}/>);
 expect(html.indexOf('src="/third-bag.jpg"')).toBeLessThan(html.indexOf('Les essentiels de saison'));expect(html.indexOf('Voir le produit')).toBeLessThan(html.indexOf('Commentaires'));expect(html).toContain('aspect-ratio:4/3');
});
