import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Third-party libraries in their own chunk: cached across app deploys.
          // QR libraries stay out of it: they load only when a QR window is opened.
          // Phase 4.1 (P4-13): canvas-confetti too — it is imported on first use (src/utils/confetti.ts).
          // Supabase deliberately stays in this chunk: measured on slow 4G, moving it into its own chunk showed
          // the loading screen 0.3 s sooner but the sign-in form 0.2 s later (it then downloads after the main
          // file instead of in parallel). See docs/PHASE4.1-RESIDUAL-CORRECTIONS-REPORT.md.
          codeSplitting: {
            groups: [{ name: 'vendor', test: /node_modules[\\/](?!qrcode|qr-scanner|pngjs|dijkstrajs|canvas-confetti)/ }],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
