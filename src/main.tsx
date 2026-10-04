import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Remove credentials saved for the retired remote media integration.
try {
  for (const key of ['colab_url', 'colab_key', 'colab_video_url', 'colab_video_key', 'colab_image_url', 'colab_image_key']) {
    localStorage.removeItem(key);
  }
} catch {
  // Storage may be disabled; it must not prevent the app from opening.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
