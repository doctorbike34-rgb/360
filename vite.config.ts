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
    base: '/',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // Use public/manifest.json
        injectRegister: false,
        includeManifestIcons: true,
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          importScripts: ['firebase-messaging-sw-import.js'],
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
        // Ensure old caches are cleaned up on update
        selfDestroying: false,
        devOptions: {
          enabled: false // Disable SW in dev to avoid annoying fetch errors during rapid edits
        }
      })
    ],
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Firebase — keep together, already small
            if (id.includes('node_modules/firebase')) return 'firebase-vendor';
            // React core
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/zustand')) return 'react-vendor';
            // UI libs
            if (id.includes('node_modules/motion') || id.includes('node_modules/lucide-react') || id.includes('node_modules/react-hot-toast')) return 'ui-vendor';
            // Map libs (Leaflet is heavy)
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet') || id.includes('node_modules/geofire')) return 'map-vendor';
            // i18n
            if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
            // Stripe / payments
            if (id.includes('node_modules/@stripe')) return 'stripe-vendor';
            // Date utils
            if (id.includes('node_modules/date-fns')) return 'date-vendor';
            // Form libs
            if (id.includes('node_modules/react-hook-form') || id.includes('node_modules/zod') || id.includes('node_modules/@hookform')) return 'forms-vendor';
            // Phone input
            if (id.includes('node_modules/react-phone')) return 'phone-vendor';
            // Sentry (monitoring, not critical path)
            if (id.includes('node_modules/@sentry')) return 'sentry-vendor';
          }
        }
      }
    },
    envPrefix: ['VITE_'],
    resolve: {
      dedupe: ['leaflet', 'react-leaflet'],
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
