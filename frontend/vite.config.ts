import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/pdv.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'NexoComanda',
        short_name: 'NexoComanda',
        lang: 'pt-BR',
        description: 'Ponto de venda de lanchonete — caixa, cozinha, estoque e financeiro',
        theme_color: '#ea580c',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/pdv-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pdv-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pdv-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['**/wiki-artigo-*.js'],
        runtimeCaching: [
          {
            // Artigos estaticos com hash: carregar ao abrir, cachear apos visita.
            urlPattern: ({ url }: { url: URL }) => url.origin === self.location.origin && /\/assets\/wiki-artigo-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'wiki-artigos', expiration: { maxEntries: 60, maxAgeSeconds: 31536000 } },
          },
          {
            // Respostas autenticadas não podem compartilhar cache entre usuários.
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
