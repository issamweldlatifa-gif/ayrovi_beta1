/* Test-only integration harness; never imported by the production application. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider, useNavigationHistory } from '../client/src/navigation/NavigationHistory';
import { AiAssistantDrawer } from '../client/src/components/assistant/AiAssistantDrawer';
function Fixture() {
  const navigation = useNavigationHistory();
  return <><button data-open onClick={() => navigation.pushLayer({ id: 'app:assistant' })}>SONIM test fixture</button>
    <AiAssistantDrawer isOpen={navigation.has('app:assistant')} onClose={() => navigation.back()} onOpenLens={() => {}} onOpenOrders={() => {}} onOpenAccount={() => {}} onOrder={async () => {}}/>
  </>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><Fixture/></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
