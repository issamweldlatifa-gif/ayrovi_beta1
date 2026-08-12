import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AdminApp } from './admin/AdminApp';
import './index.css';

const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminPath ? <AdminApp /> : <App />}
  </React.StrictMode>
);
