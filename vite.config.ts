import { defineConfig } from 'vite'

// GitHub Pages(/badminton/)에서도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
})
