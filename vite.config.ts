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
          // Avoid caching API calls or internal preview paths
          navigateFallbackDenylist: [/^\/api/, /^\/google/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
             {
              urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
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
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('react')) return 'vendor-react';
              if (id.includes('leaflet')) return 'vendor-maps';
              if (id.includes('lucide-react')) return 'vendor-ui';
              if (id.includes('motion')) return 'vendor-ui';
              if (id.includes('stripe')) return 'vendor-stripe';
              if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
              return 'vendor-utils';
            }
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
    },
  };
});
