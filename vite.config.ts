import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'node:os'
import type { AddressInfo } from 'node:net'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Celular como leitor: o celular manda o que leu pela conexão do Vite e o computador recebe.
// Só existe no npm run dev; a versão estática não tem servidor para repassar.
function scanRelay(): Plugin {
  return {
    name: 'massforge-scan-relay',
    configureServer(server) {
      server.ws.on('mf:scan', (data) => server.ws.send('mf:scan', data))
      server.middlewares.use('/__mf/lan', (_request, response) => {
        const ips = Object.values(networkInterfaces()).flat()
          .filter((item) => item && item.family === 'IPv4' && !item.internal)
          .map((item) => item!.address)
          .sort((a, b) => Number(!/^192\.168\./.test(a)) - Number(!/^192\.168\./.test(b)))
        const port = (server.httpServer?.address() as AddressInfo | null)?.port ?? 5173
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ ips, port }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), scanRelay()],
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
