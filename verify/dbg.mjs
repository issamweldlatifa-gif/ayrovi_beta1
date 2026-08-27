import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForSelector('.lens-hero'); await p.waitForTimeout(600);
const r = await p.evaluate(() => {
  const lens=document.querySelector('.lens-hero');
  const hero=document.querySelector(".managed-public-section[data-public-section='hero']");
  const white=lens.closest('.bg-white');
  const cs=getComputedStyle(hero);
  return {
    lensBottom: Math.round(lens.getBoundingClientRect().bottom+scrollY),
    whiteBottom: white?Math.round(white.getBoundingClientRect().bottom+scrollY):null,
    heroBottom: Math.round(hero.getBoundingClientRect().bottom+scrollY),
    heroPadBlockEnd: cs.paddingBlockEnd,
    heroPadBlock: cs.paddingBlock,
    bodyH: Math.round(document.body.scrollHeight),
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
