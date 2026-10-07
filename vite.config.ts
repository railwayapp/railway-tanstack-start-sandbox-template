import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
    // Nitro builds a self-contained Node server into .output/, which Railway
    // runs with `node .output/server/index.mjs`.
    nitro(),
  ],
})
