import './services/formerBrandStorage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/journey.css';
import { AdminApp } from './admin/AdminApp';
import { LocaleProvider } from './i18n/LocaleContext';
import { NavigationHistoryProvider } from './navigation/NavigationHistory';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><LocaleProvider><NavigationHistoryProvider><AdminApp /></NavigationHistoryProvider></LocaleProvider></React.StrictMode>,
);
