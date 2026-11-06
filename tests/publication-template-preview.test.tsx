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
