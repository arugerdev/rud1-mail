/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // La imagen Docker que corre junto a Mailcow en mail.rud1.es.
  output: "standalone",
  // Librerías de servidor que no deben pasar por webpack: hablan con sockets
  // (IMAP/SMTP) y traen dependencias opcionales nativas.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "sanitize-html", "html-to-text"],
  experimental: {
    serverActions: {
      // Los adjuntos viajan en el envío del formulario de redactar.
      bodySizeLimit: "26mb",
    },
    optimizePackageImports: ["lucide-react", "sonner", "next-themes"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            // Los correos se pintan en un marco sin scripts y con su propia
            // política (ver message-frame); aquí se cierra el resto.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-src 'self' blob:",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
