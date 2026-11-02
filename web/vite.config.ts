// 출처: https://github.com/pwa-builder/pwa-starter/blob/main/vite.config.ts
// 스타터는 public/sw.js에 Workbox CDN을 불러오지만, 여기서는 generateSW로 서비스 워커를 빌드 때 만든다.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 하위 경로(/<저장소>/)에서도 열리도록 상대 경로로 낸다.
  base: './',
  build: { target: 'es2022', assetsDir: 'code' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon*.png', 'icon-48*.png', 'icons/sprite.svg'],
      manifest: {
        id: './',
        name: '성대 공지 맞춤 알림',
        short_name: '성대 공지',
        description: '성균관대 공지 중 나에게 해당하는 글만 모아 봅니다',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        // Windows에서 설치하면 제목 표시줄 자리까지 앱이 쓴다(pwa-starter와 같음).
        display_override: ['window-controls-overlay', 'standalone'],
        launch_handler: { client_mode: 'focus-existing' },
        orientation: 'any',
        background_color: '#f3f7f5',
        theme_color: '#f3f7f5',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icon-48.png', sizes: '48x48', type: 'image/png' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          // 안드로이드 테마 아이콘(One UI 포함)이 배경색에 맞춰 칠하는 흰 실루엣. 다크 모드 대응은 런처가 한다.
          { src: 'icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
        shortcuts: [
          { name: '내 공지', url: './?tab=mine', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: '마감 임박', url: './?tab=deadline', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,svg,png}'],
        // 암호화 라이브러리(약 420KB)는 설정에서 키를 저장할 때만 불러오므로 미리 저장하지 않는다.
        globIgnores: ['**/libsodium*.js', '**/*-dark.png', '**/icons/notify/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//],
        runtimeCaching: [
          {
            // 공지 목록은 네트워크 우선: 오래된 목록을 최신처럼 보이지 않게 한다.
            urlPattern: ({ url }) => url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5, expiration: { maxEntries: 10 } },
          },
          {
            // Pretendard 글꼴 조각은 파일 이름이 바뀌지 않으므로 캐시 우선.
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 120 } },
          },
        ],
      },
    }),
  ],
});
