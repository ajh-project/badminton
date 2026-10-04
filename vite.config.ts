import { defineConfig } from 'vite'

// GitHub Pages(/badminton/)에서도 동작하도록 상대 경로로 빌드
// index.html = 3D, classic.html = 2D 클래식
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: 'index.html', classic: 'classic.html' },
    },
  },
})
