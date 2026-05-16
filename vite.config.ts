import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // Use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // Avoid caching API calls, Firebase internals or internal preview paths
        navigateFallbackDenylist: [/^\/api/, /^\/google\//, /^\/__\//, /cloudfunctions\.net/, /googleapis\.com/, /firebase\.io/, /mt1\.google\.com/],
        runtimeCaching: [
            {
              urlPattern: ({ url }) => {
                return url.hostname.includes('cloudfunctions.net') || 
                       url.hostname.includes('googleapis.com') ||
                       url.hostname.includes('firebase.io');
              },
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false // Disable SW in dev to avoid annoying fetch errors during rapid edits
        }
      })
    ],
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'zustand'],
            'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
            'ui-vendor': ['framer-motion', 'lucide-react', 'react-hot-toast'],
            'map-vendor': ['leaflet', 'react-leaflet']
          }
        }
      }
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'root': path.resolve(__dirname, '.')
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    },
  };
});
