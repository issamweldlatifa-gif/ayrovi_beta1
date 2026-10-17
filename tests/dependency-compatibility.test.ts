import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));

describe('security updates retain the APIs actually consumed by ZAYROVI', () => {
  it('mailparser still parses MIME and international sender/recipient names through nodemailer', async () => {
    const {simpleParser}=require('mailparser');
    const mail=await simpleParser('From: "ZAYROVI Client" <client@example.test>\r\nTo: support@example.test\r\nSubject: =?UTF-8?B?2LfZhNio?=\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBonjour — مرحبا');
    expect(mail.from.value[0].address).toBe('client@example.test');
    expect(mail.to.value[0].address).toBe('support@example.test');
    expect(mail.subject).toBe('طلب');expect(mail.text).toContain('مرحبا');
  });
  it('query parsing keeps nested filters and rejects prototype keys', () => {
    const qs=require('qs');
    expect(qs.parse('filter[status]=PENDING&page=2')).toEqual({filter:{status:'PENDING'},page:'2'});
    expect(qs.parse('__proto__[polluted]=yes')).toEqual({});
    expect(({} as any).polluted).toBeUndefined();
  });
  it('the asset generator and app share the patched image engine and compatible CLI', async () => {
    const assetsRequire=createRequire(require.resolve('@capacitor/assets/package.json'));
    expect(assetsRequire.resolve('sharp')).toBe(require.resolve('sharp'));
    expect(assetsRequire.resolve('@capacitor/cli/package.json')).toBe(require.resolve('@capacitor/cli/package.json'));
    const sharp=assetsRequire('sharp');
    const image=await sharp({create:{width:20,height:20,channels:4,background:'#fff'}}).resize(12,12).png().toBuffer();
    expect(await sharp(image).metadata()).toMatchObject({width:12,height:12,format:'png'});
  });
  it('Capacitor can actually extract a template with tar 7 (not an incompatible tar-only override)', async () => {
    const {extractTemplate}=require('@capacitor/cli/dist/util/template');
    const tar=require('tar');const dir=await mkdtemp(path.join(tmpdir(),'ayrovi-tar-'));
    try {await writeFile(path.join(dir,'entry.txt'),'template');await tar.c({cwd:dir,file:path.join(dir,'template.tar.gz'),gzip:true},['entry.txt']);
      await extractTemplate(path.join(dir,'template.tar.gz'),path.join(dir,'result'));
      expect(await readFile(path.join(dir,'result/entry.txt'),'utf8')).toBe('template');
    } finally {await rm(dir,{recursive:true,force:true});}
  });
  it('the actual native asset script awaits composition and applies the requested logo scale', async () => {
    const sharp=require('sharp');const dir=await mkdtemp(path.join(tmpdir(),'ayrovi-assets-'));
    try {
      await mkdir(path.join(dir,'client/public/media'),{recursive:true});
      // Source = logo clair (Z blanc, 86 % de la largeur de son carré transparent) : on le simule par un carré blanc de 86 %.
      const mark=await sharp({create:{width:86,height:86,channels:4,background:'#FFFFFF'}}).png().toBuffer();
      await sharp({create:{width:100,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:mark,left:7,top:7}]).png().toFile(path.join(dir,'client/public/media/logo-ayrovi-light.png'));
      execFileSync(process.execPath,[path.resolve('scripts/cap-assets.mjs')],{cwd:dir});
      expect(await sharp(path.join(dir,'assets/icon.png')).metadata()).toMatchObject({width:1024,height:1024});
      // fond noir de la palette, Z à 62 % de la largeur de l'icône
      const trimmed=(await sharp(path.join(dir,'assets/icon.png')).trim({background:'#0A0A0A',threshold:60}).toBuffer({resolveWithObject:true})).info.width;
      expect(Math.abs(trimmed-Math.round(1024*.62))).toBeLessThanOrEqual(10); // ±1 % : bord adouci par l'agrandissement
      expect(await sharp(path.join(dir,'assets/splash.png')).metadata()).toMatchObject({width:2732,height:2732});
      expect(await sharp(path.join(dir,'assets/splash-dark.png')).metadata()).toMatchObject({width:2732,height:2732});
    } finally {await rm(dir,{recursive:true,force:true});}
  });
  it('Xcode retains its UUID generation API with the bounded CommonJS uuid release', () => {
    const xcode=require('xcode');const project=xcode.project('unused-fixture.pbxproj');
    project.hash={project:{objects:{}}};expect(project.generateUuid()).toMatch(/^[A-F0-9]{24}$/);
  });
});
