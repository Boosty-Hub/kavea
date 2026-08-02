import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  // El middleware borra estas cabeceras en cada petición, pero declararlas aquí
  // documenta que son de uso interno y nunca deben llegar del exterior.
  poweredByHeader: false,

  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
}

export default config
