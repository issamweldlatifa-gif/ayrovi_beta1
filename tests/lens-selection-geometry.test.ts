import { describe, expect, it } from 'vitest';
import { containedImageRect, pointInImage, detectedBox, selectionForPoint, resizeSelection } from '../client/src/ayrovix/services/lensSelectionGeometry';
describe('Lens image selection geometry', () => {
 it('letterboxes a wide image without zooming or crop', () => {
  expect(containedImageRect(400, 600, 800, 400)).toEqual({x:0,y:200,w:400,h:200});
 });
 it('pillarboxes a portrait in landscape', () => {
  expect(containedImageRect(600, 300, 200, 400)).toEqual({x:225,y:0,w:150,h:300});
 });
 it('maps the visible content, not the image element box', () => {
  const rect=containedImageRect(400,600,800,400)!;
  expect(pointInImage(200,250,rect)).toEqual({x:50,y:25});
  expect(pointInImage(200,150,rect)).toBeNull();
 });
 it.each([0, -1, NaN, Infinity])('rejects unavailable dimensions %s', value => {
  expect(containedImageRect(400,600,value,400)).toBeNull();
 });
 it('validates provider bounds and clips overflow', () => {
  expect(detectedBox([.8,.5,.4,.3])).toEqual({x:80,y:50,w:expect.closeTo(20),h:30});
  for(const v of [null, [0,0,-1,1], [-.1,0,.5,.5], [NaN,0,1,1], [0,0,1], [1,0,1,1]]) expect(detectedBox(v)).toBeNull();
 });
 it('selects the smallest real containing product, not its parent', () => {
  const parent={x:0,y:0,w:80,h:90}, shoe={x:30,y:70,w:20,h:15};
  expect(selectionForPoint({x:35,y:80},[parent,shoe])).toEqual(shoe);
 });
 it('does not jump to a nearby unrelated detection', () => {
  expect(selectionForPoint({x:60,y:60},[{x:30,y:30,w:20,h:20}])).toEqual({x:45,y:45,w:30,h:30});
 });
 it('keeps manual crops inside the image at all edges', () => {
  for(const point of [{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]) {
   const b=selectionForPoint(point,[]);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(100);expect(b.y+b.h).toBeLessThanOrEqual(100);
  }
 });
 it.each(['nw','ne','sw','se'] as const)('keeps %s corner resize bounded and nonzero', corner => {
  for(const delta of [-1000,1000]) {const b=resizeSelection({x:20,y:20,w:60,h:60},corner,delta,delta);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(100);expect(b.y+b.h).toBeLessThanOrEqual(100);expect(b.w).toBeGreaterThanOrEqual(4);expect(b.h).toBeGreaterThanOrEqual(4);}
 });
});
