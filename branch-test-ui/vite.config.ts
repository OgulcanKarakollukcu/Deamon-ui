import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiProxyTarget = env.VITE_SCAN_LINK_API_PROXY_TARGET || 'http://127.0.0.1:8095'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '.ngrok-free.dev',
        'uncalculable-nondefinably-addie.ngrok-free.dev',
      ],
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '.ngrok-free.dev',
        'uncalculable-nondefinably-addie.ngrok-free.dev',
      ],
    },
  }
})
