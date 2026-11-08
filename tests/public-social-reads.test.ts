import { expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { readPublishedSocial } from '../src/magazine/publicSocialReads';
import { socialPage } from '../src/public/socialPaging';
import { LINKED_PRODUCT_JOIN_SELECT } from '../src/services/shoppableContent';
const now = '2026-11-05T00:00:00.000Z';
it.each(['publication','reel'] as const)('%s reads match the previous SQL projection and keep timestamp boundaries', async kind => {
  const table = kind === 'reel' ? 'reels' : 'publications';
  db.run('SAVEPOINT social_read_fixture');
  try {
    const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
    for (let i=0; i<37; i++) {
      const id = `social_read_${kind}_${String(i).padStart(3,'0')}`;
      db.run(`INSERT INTO ${table}(id,title,channel_id,${kind === 'reel' ? 'video_url' : 'image_url'},publish_at,status,created_at,updated_at)
        VALUES (?,'Fixture',?,'/media/fixture',?,?,'2026-01-01','2026-01-01')`, id,publisher,
        i===36 ? '2099-01-01' : i===35 ? now : '2026-01-01', i===34 ? 'brouillon' : 'publie');
    }
    const selectedId = `social_read_${kind}_020`;
    const productId = `social_read_product_${kind}`;
    db.run(`INSERT INTO products(id,name,status,final_price,created_at,updated_at)
      VALUES (?,'Linked fixture','ACTIVE',77.5,'2026-01-01','2026-01-01')`,productId);
    db.run(`UPDATE ${table} SET product_id=?,content_mode='shoppable' WHERE id=?`,productId,selectedId);
    for (const [i,type] of ['view','view','like','comment'].entries()) db.run(`INSERT INTO story_interactions(id,target_id,target_kind,type,text,created_at)
      VALUES (?,?,'post',?,'fixture','2026-01-01')`, `social_read_${kind}_interaction_${i}`,selectedId,type);
    const alias = kind === 'reel' ? 'r' : 'pub';
    const select = kind === 'reel'
      ? `r.id,r.title,r.channel_id,r.description,r.video_url,r.poster_url,r.duration_seconds,r.publish_at,r.content_mode,
        (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=r.id AND i.type='view') views,
        (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=r.id AND i.type='like') likes`
      : 'pub.id,pub.title,pub.subtitle,pub.channel_id,pub.image_url,pub.publish_at,pub.content_mode';
    const old = db.all(`SELECT ${select},${LINKED_PRODUCT_JOIN_SELECT} FROM ${table} ${alias}
      LEFT JOIN products p ON p.id=${alias}.product_id WHERE ${alias}.status='publie' AND ${alias}.publish_at<=?
      ORDER BY ${alias}.publish_at DESC,${alias}.id DESC`, now);
    expect(readPublishedSocial(db,kind,now).items).toEqual(old);
    const traversed: unknown[] = [];
    let page = socialPage({limit:7});
    do {
      const result = readPublishedSocial(db,kind,now,page);
      expect(result.items.length).toBeLessThanOrEqual(7);
      traversed.push(...result.items);
      page = result.nextCursor ? socialPage({limit:7,cursor:result.nextCursor}) : undefined;
    } while(page);
    expect(traversed).toEqual(old);
    const firstId = `social_read_${kind}_035`;
    expect(readPublishedSocial(db,kind,now,{limit:2,anchor:firstId}).items[0].id).toBe(firstId);
    const linked = readPublishedSocial(db,kind,now,{limit:1,anchor:selectedId}).items[0];
    expect(linked.lp_id).toBe(productId);
    expect(linked.lp_final_price).toBe(77.5);
    if (kind === 'reel') expect(linked).toMatchObject({ views: 2, likes: 1 });
    const response = await request(app).get(`/api/public/social/${table}`).query({ limit: 1, anchor: selectedId });
    expect(response.body.data.items[0].product).toMatchObject({ id: productId });
    expect(Object.keys(response.body.data.items[0]).some(key => key.startsWith('lp_'))).toBe(false);
    const first = readPublishedSocial(db,kind,now,{limit:1,anchor:selectedId});
    expect(first.items[0].id).toBe(selectedId);
    db.run(`DELETE FROM ${table} WHERE id=?`,selectedId);
    const next = readPublishedSocial(db,kind,now,socialPage({limit:1,cursor:first.nextCursor}));
    expect(next.items[0].id).toBe(`social_read_${kind}_019`);
    for (const suffix of ['034','036']) {
      const id = `social_read_${kind}_${suffix}`;
      const result = readPublishedSocial(db,kind,now,{limit:30,anchor:id});
      expect(result.items.some(row=>row.id===id)).toBe(false);
      expect(result.items).toEqual(old.filter((row:any)=>row.id!==selectedId).slice(0,30));
    }
    const legacy = await request(app).get(`/api/public/social/${table}`);
    expect(legacy.status).toBe(200); expect(Array.isArray(legacy.body.data)).toBe(true);
    const paged = await request(app).get(`/api/public/social/${table}?limit=7`);
    expect(paged.status).toBe(200); expect(paged.body.data.items.length).toBeLessThanOrEqual(7);
    expect(typeof paged.body.data.nextCursor).toBe('string');
  } finally { db.run('ROLLBACK TO social_read_fixture'); db.run('RELEASE social_read_fixture'); }
});
it('rejects invalid internal kinds and limits, and cannot turn an anchor into SQL', () => {
  expect(()=>readPublishedSocial(db,'toString' as 'reel',now)).toThrow(RangeError);
  for (const limit of [0,31,1.5,NaN]) expect(()=>readPublishedSocial(db,'reel',now,{limit})).toThrow(RangeError);
  const expected = readPublishedSocial(db,'reel',now,{limit:12});
  expect(readPublishedSocial(db,'reel',now,{limit:12,anchor:"x' OR 1=1--"})).toEqual(expected);
});

it('returns empty legacy and paged reads without attempting to encode a cursor', () => {
  const empty = { all: () => [], get: () => undefined };
  for (const kind of ['publication','reel'] as const) {
    expect(readPublishedSocial(empty,kind,now)).toEqual({items:[],nextCursor:null});
    expect(readPublishedSocial(empty,kind,now,{limit:12,anchor:'removed'})).toEqual({items:[],nextCursor:null});
  }
});
