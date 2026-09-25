/* Verification-only mounting of actual Lens and SONIM parents. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider, useNavigationHistory } from '../client/src/navigation/NavigationHistory';
import { LensLauncher } from '../client/src/ayrovix/components/LensLauncher';
import { AiAssistantDrawer } from '../client/src/components/assistant/AiAssistantDrawer';
const orders:unknown[]=[];(window as any).selectionTestOrders=orders;
const lens=new URLSearchParams(location.search).get('mode')==='lens';
function Fixture(){const nav=useNavigationHistory();const layer=lens?'app:lens':'app:assistant';return <><button data-open onClick={()=>nav.pushLayer({id:layer})}>Open test surface</button>{nav.has(layer)&&(lens?<LensLauncher isOpen onClose={()=>nav.back()} onOrder={async payload=>{orders.push(payload);}} cartCount={0} onOpenCart={()=>{}} darkMode={false} onToggleDarkMode={()=>{}}/>:<AiAssistantDrawer isOpen onClose={()=>nav.back()} onOpenLens={()=>{}} onOpenOrders={()=>{}} onOpenAccount={()=>{}} onOpenCart={()=>{}} onOrder={async payload=>{orders.push(payload);}}/>)}</>;}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><Fixture/></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
