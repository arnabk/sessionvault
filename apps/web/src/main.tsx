import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './styles.css';
import { AdminLayout } from './admin/AdminLayout';
import { TemplatesPage } from './admin/TemplatesPage';
import { BuilderPage } from './admin/BuilderPage';
import { SessionsPage } from './admin/SessionsPage';
import { ReviewPage } from './admin/ReviewPage';
import { SettingsPage } from './admin/SettingsPage';
import { TakePage } from './take/TakePage';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/sessions" replace /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'templates/new', element: <BuilderPage /> },
      { path: 'templates/:id', element: <BuilderPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'sessions/:id', element: <ReviewPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/take/:token', element: <TakePage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
