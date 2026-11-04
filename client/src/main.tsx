import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Landing from './Landing';
import '@xyflow/react/dist/style.css';
import './index.css';

const isLanding = !window.location.pathname.startsWith('/app') && window.location.pathname !== '/api/form-placeholder';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isLanding ? <Landing /> : <App />}</React.StrictMode>
);
