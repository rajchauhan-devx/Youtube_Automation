import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    watch: {
      // Generated media, model installations and test artifacts are not source.
      // OneDrive can lock these large files while they are being written.
      ignored: ['**/artifacts/**', '**/server/data/**', '**/ComfyUI/**', '**/.backups/**', '**/server/chatterbox/.venv/**'],
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT || '3001'}`,
        changeOrigin: false,
      },
    },
  },
});
