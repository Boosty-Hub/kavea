// @ts-check
import { defineConfig } from 'astro/config'

// Salida estática pura. Sin SSR, sin middleware, sin protección de bots.
// El rastreador de Meta tiene que poder leer /privacidad y /eliminacion-de-datos
// y recibir 200: un enlace que no responde es causa de rechazo del App Review.
export default defineConfig({
  site: 'https://kavea.ai',
  output: 'static',
  build: {
    format: 'directory',
  },
})
