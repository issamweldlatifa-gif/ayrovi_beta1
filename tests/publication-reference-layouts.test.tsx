import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {publicationTiles} from '../shared/publicationLayouts';
import {normalizePublicationContent,publicationTypeForTemplate,PUBLICATION_TEMPLATES} from '../shared/publicationContent';
import {PublicationTemplatePreview} from '../client/src/admin/PublicationTemplatePreview';
const images=Array.from({length:8},(_,i)=>({type:'image',url:`/media/reference-${i}.jpg`,poster:'',alt:`Photo ${i+1}`}));
describe('five additive reference templates',()=>{
 it.each(['social_mosaic','shoppable','caption_photo','social_strip','social_pair'])('%s survives normalization and matches caption-first CRM rendering',template=>{
  const media=images.slice(0,template==='social_pair'?2:['shoppable','caption_photo'].includes(template)?1:8);
  const body={template_id:template,post_type:publicationTypeForTemplate(template),media,description:'Texte avant les photos',description_position:'below'};
  expect(PUBLICATION_TEMPLATES).toContain(template);
  const parsed=normalizePublicationContent(body);expect(parsed?.template).toBe(template);expect(parsed?.descriptionPosition).toBe('above');expect(parsed?.media).toHaveLength(media.length);
  const html=renderToStaticMarkup(<PublicationTemplatePreview form={{...body,title:'Titre interne',description:body.description}}/>);
  expect(html.indexOf(body.description)).toBeLessThan(html.indexOf('src="/media/reference-0.jpg"'));
  expect(html).not.toContain('Titre interne');
 });
 it('uses two large square tiles above three small square tiles and counts only hidden photos',()=>{
  const rows=publicationTiles('social_mosaic',8);expect(rows.map(r=>r.length)).toEqual([2,3]);expect(rows.flat().map(t=>t.index)).toEqual([0,1,2,3,4]);expect(rows[1][2].remaining).toBe(3);
 });
 it('renders 2, 3 and 4-photo mosaics without empty tiles or invented overlays',()=>{
  for(const n of [2,3,4]){const rows=publicationTiles('social_mosaic',n);expect(rows.flat()).toHaveLength(n);expect(rows.flat().every(t=>t.remaining===0)).toBe(true);}
 });
 it('keeps strip and duo geometry distinct and rejects incompatible media',()=>{
  expect(publicationTiles('social_strip',9)[0]).toEqual([{index:0,remaining:0},{index:1,remaining:0},{index:2,remaining:6}]);
  expect(publicationTiles('social_pair',2)[0]).toHaveLength(2);
  expect(normalizePublicationContent({template_id:'social_pair',post_type:'collection',media:images.slice(0,3)})).toBeNull();
  expect(normalizePublicationContent({template_id:'caption_photo',post_type:'image',media:images.slice(0,2)})).toBeNull();
  expect(normalizePublicationContent({template_id:'social_mosaic',post_type:'collection',media:images.slice(0,1)})).toBeNull();
 });
 it('retains the six previous template identifiers',()=>expect(PUBLICATION_TEMPLATES.slice(0,6)).toEqual(['auto','photo','split','campaign','carousel','video']));
});
