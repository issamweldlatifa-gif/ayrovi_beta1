import { afterEach, describe, expect, test, vi } from 'vitest';
import { addComment, getComments, likePost, sharePost, storiesToPosts, mapDbStories, publisherFor, timeAgo, OFFICIAL } from '../client/src/social/storyService';

afterEach(() => vi.unstubAllGlobals());
describe('Story Tab service', () => {
  test('publisherFor : officiel d\'abord, channels par catégorie', () => {
    expect(publisherFor('ARRIVAGE')).toBe(OFFICIAL);
    expect(publisherFor('STYLE').id).toBe('pub_style');
    expect(publisherFor('INCONNU').name).toBe('Inconnu');
    expect(publisherFor('INCONNU').id).toBe('pub_inconnu');
  });

  test('mapDbStories : mapping backend → Story (seen false, cta dérivé)', () => {
    const stories = mapDbStories([
      { id: 's1', media_url: '/media/hero-femme.jpg', media_type: 'IMAGE', category: 'ARRIVAGE', title: 'Arrivage #08', description: 'Sélection ouverte', cta: 'Découvrir', arrival_id: 'arrival_08', publish_at: '2026-08-14T10:00:00.000Z' },
      { id: 's2', media_url: '', category: 'STYLE' },
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].media.type).toBe('image');
    expect(stories[0].publisher.official).toBe(true);
    expect(stories[0].cta?.action).toBe('arrivages');
    expect(stories[0].seen).toBe(false);
  });

  test('does not seed counters or restore fabricated offline likes', () => {
    const posts = storiesToPosts(mapDbStories([{ id:'post_1', media_url:'/media/item.jpg', category:'STYLE' }]));
    expect(posts[0]).toMatchObject({ likesCount:0, commentsCount:0, sharesCount:0, likedByCurrentUser:false });
  });
  test('never reports a saved comment, empty feed or successful like on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(addComment('post_1','Test comment')).rejects.toThrow('COMMENT_NOT_PUBLISHED');
    await expect(getComments('post_1')).rejects.toThrow('COMMENTS_UNAVAILABLE');
    await expect(likePost('post_1',true)).resolves.toBeNull();
  });
  test('preserves real authentication requirements', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{}',{status:401}))));
    await expect(addComment('post_1','Test comment')).resolves.toEqual({authRequired:true});
    await expect(likePost('post_1',true)).resolves.toMatchObject({authRequired:true});
  });
  test('uses only the server-confirmed comment and count', async () => {
    const comment={id:'c1',author:'Client',text:'Merci',createdAt:new Date().toISOString()};
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({success:true,data:comment})))
      .mockResolvedValueOnce(new Response(JSON.stringify({success:true,data:{liked:false,likesCount:4}})));
    vi.stubGlobal('fetch',fetch);
    await expect(addComment('post_1','Merci')).resolves.toEqual(comment);
    await expect(likePost('post_1',true)).resolves.toEqual({liked:false,likesCount:4});
  });
  test('rejects malformed successful responses instead of crashing the sheet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({success:true,data:[{}]})))));
    await expect(getComments('post_1')).rejects.toThrow('COMMENTS_UNAVAILABLE');
    await expect(addComment('post_1','Merci')).rejects.toThrow('COMMENT_NOT_PUBLISHED');
    await expect(likePost('post_1',true)).resolves.toBeNull();
  });

  test('does not count an unavailable/cancelled share or throw without clipboard support', async () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('window',{location:{origin:'https://example.test'}});vi.stubGlobal('navigator',{});
    const post=storiesToPosts(mapDbStories([{id:'p1',media_url:'/image.jpg'}]))[0];
    await expect(sharePost(post)).resolves.toBe(false);expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('navigator',{share:vi.fn().mockRejectedValue(new Error('cancelled'))});
    await expect(sharePost(post)).resolves.toBe(false);expect(fetch).not.toHaveBeenCalled();
  });
  test('copies the actual post URL and records only a completed share action', async () => {
    const fetch=vi.fn().mockResolvedValue({});const writeText=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch',fetch);vi.stubGlobal('window',{location:{origin:'https://example.test'}});vi.stubGlobal('navigator',{clipboard:{writeText}});
    const post=storiesToPosts(mapDbStories([{id:'p1',media_url:'/image.jpg'}]))[0];
    await expect(sharePost(post)).resolves.toBe(true);expect(writeText).toHaveBeenCalledWith('https://example.test/?post=p1');expect(fetch).toHaveBeenCalledOnce();
  });

  test('timeAgo : minutes / heures / jours en français et arabe', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 5 * 60000).toISOString())).toBe('il y a 5 min');
    expect(timeAgo(new Date(now - 3 * 3600000).toISOString())).toBe('il y a 3 h');
    expect(timeAgo(new Date(now - 2 * 86400000).toISOString())).toBe('il y a 2 j');
    expect(timeAgo(new Date(now - 5 * 60000).toISOString(), 'ar')).toBe('منذ 5 د');
    expect(timeAgo(new Date(now - 3 * 3600000).toISOString(), 'ar')).toBe('منذ 3 س');
    expect(timeAgo(new Date(now - 2 * 86400000).toISOString(), 'ar')).toBe('منذ 2 ي');
  });
});
