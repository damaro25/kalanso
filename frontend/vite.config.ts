import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Kalanso',
        short_name: 'Kalanso',
        description: "Plateforme de gestion scolaire pour les écoles privées guinéennes",
        theme_color: '#17ae89',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icons/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Sans ça, un nouveau service worker reste "waiting" tant qu'un onglet
        // de l'ancienne version est ouvert : les utilisateurs se retrouvent à
        // exécuter du code périmé après un déploiement sans même le savoir.
        // clientsClaim fait prendre le contrôle immédiatement après activation ;
        // skipWaiting court-circuite l'attente de fermeture des anciens onglets.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
