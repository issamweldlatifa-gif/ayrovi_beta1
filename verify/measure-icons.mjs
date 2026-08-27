import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:900} });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForSelector('.lens-features'); await p.waitForTimeout(400);
const r = await p.evaluate(() => {
  const icons=[...document.querySelectorAll('.lens-feature__icon')].map(e=>{const x=e.getBoundingClientRect();return {left:+x.left.toFixed(1),right:+x.right.toFixed(1),w:+x.width.toFixed(1)};});
  const titles=[...document.querySelectorAll('.lens-feature__title')].map(e=>+e.getBoundingClientRect().width.toFixed(1));
  const feats=[...document.querySelectorAll('.lens-feature')].map(e=>{const x=e.getBoundingClientRect();return {left:+x.left.toFixed(1),right:+x.right.toFixed(1)};});
  const gaps=icons.slice(1).map((ic,i)=>+(ic.left-icons[i].right).toFixed(1));
  const centers=icons.map(ic=>+((ic.left+ic.right)/2).toFixed(1));
  const centerDeltas=centers.slice(1).map((c,i)=>+(c-centers[i]).toFixed(1));
  return { icons, gaps, centers, centerDeltas, titles, feats };
});
console.log(JSON.stringify(r,null,1));
await b.close();
