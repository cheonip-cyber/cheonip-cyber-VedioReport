import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
      ],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
        'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ''),
        // 테스트 모드: true 시 스토리보드 컷을 전체의 50%만 표시
        // Vercel 환경변수에서 VITE_DEMO_MODE=true 로 설정하여 활성화
        // 풀버전 복원 시 Vercel에서 해당 변수를 삭제하거나 false로 변경
        'import.meta.env.VITE_DEMO_MODE': JSON.stringify(env.VITE_DEMO_MODE || process.env.VITE_DEMO_MODE || 'false'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
