import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as Icons from '../client/src/components/QatafoIcons';
import { EditorialIcon, type EditorialIconName } from '../client/src/design/editorial/Icon';
import { IconDirectionProvider } from '../client/src/design/editorial/IconDirection';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { Navbar } from '../client/src/components/Navbar';
import { accountSections } from '../client/src/components/account/model';

describe('every compatibility icon resolves to the approved geometry',()=>{
  it.each(Object.entries(Icons))('%s matches the reference in LTR and RTL',(alias,Component)=>{
    for(const direction of ['ltr','rtl'] as const){
      const actual=renderToStaticMarkup(<IconDirectionProvider direction={direction}><Component /></IconDirectionProvider>);
      const name=actual.match(/data-editorial-icon="([^"]+)"/)?.[1] as EditorialIconName;
      expect(name,`${alias}: editorial family is mandatory`).toBeTruthy();
      const expected=renderToStaticMarkup(<EditorialIcon name={name} direction={direction} data-ayrovi-icon={name} />);
      expect(actual).toBe(expected);
    }
  });
  it('locks geometry but preserves semantic selected-state fills',()=>{
    const html=renderToStaticMarkup(<Icons.Star fill="currentColor" strokeWidth={9} strokeLinecap="round" viewBox="0 0 90 90" style={{strokeWidth:99}}/>);
    expect(html).toContain('fill="currentColor"');expect(html).toContain('stroke-width="1.5"');expect(html).toContain('stroke-linecap="square"');expect(html).toContain('viewBox="0 0 24 24"');expect(html).not.toContain('stroke-width:99');
  });
  it('the real header renders Menu and User through CustomerIdentity, without replacing the logo',()=>{
    const html=renderToStaticMarkup(<LocaleProvider><CustomerIdentity><Navbar onOpenMenuDrawer={()=>{}} onOpenAccount={()=>{}} onGoHome={()=>{}} onOpenCart={()=>{}} logoUrl="/media/logo-ayrovi.png" /></CustomerIdentity></LocaleProvider>);
    expect(html).toContain('data-editorial-icon="Menu"');
    expect(html).toContain('data-editorial-icon="User"');
    // Identité A.ROVI : le lockup officiel remplace l'icône + le mot « AYROVI »
    // lorsque le logo public n'est pas personnalisé dans l'Admin.
    expect(html).toContain('src="/media/logo-ayrovi-lockup-black-orange.svg"');
    expect(html).not.toContain('<strong');
    expect(html).toContain('stroke-linecap="square"');
  });
  it('a custom public logo keeps the historical icon + word rendering',()=>{
    const html=renderToStaticMarkup(<LocaleProvider><CustomerIdentity><Navbar onOpenMenuDrawer={()=>{}} onOpenAccount={()=>{}} onGoHome={()=>{}} onOpenCart={()=>{}} logoUrl="/uploads/interface/logo-custom.png" /></CustomerIdentity></LocaleProvider>);
    expect(html).toContain('src="/uploads/interface/logo-custom.png"');
    expect(html).toContain('>AYROVI</strong>');
  });
  it('all account section icons resolve to editorial, not only the authentication screen',()=>{
    for(const item of accountSections){
      const html=renderToStaticMarkup(<IconDirectionProvider direction="ltr"><item.icon /></IconDirectionProvider>);
      expect(html,item.id).toContain('data-editorial-icon=');
      expect(html,item.id).toContain('stroke-width="1.5"');
    }
  });
});
