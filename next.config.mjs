/**
 * Rutas que ponen su PROPIA Content-Security-Policy, mucho más estricta que la
 * global (`default-src 'none'`, normalmente con `sandbox`): sirven contenido
 * AJENO —la imagen de un correo, un adjunto, un archivo compartido— que nunca
 * debe ejecutar nada.
 *
 * La CSP global (script-src 'unsafe-inline' 'unsafe-eval') las SUSTITUÍA: un SVG
 * con <script> servido por /api/imagen ejecutaba código en mail.rud1.es con la
 * sesión de quien abriera esa dirección como página (A-42). Estas rutas se
 * dejan fuera de la CSP global para que mande la suya; el resto de cabeceras de
 * seguridad sí se les siguen poniendo.
 *
 * Son trozos de una expresión regular, tal como las lee path-to-regexp.
 */
const CON_CSP_PROPIA = [
  "api/imagen(?:/|$)",
  "api/adjunto(?:/|$)",
  "api/archivos(?:/|$)",
  // Solo la descarga de un enlace compartido: la página /f/<token> es HTML de
  // la aplicación y sí lleva la CSP global.
  "f/[^/]+/d/",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // La imagen Docker que corre junto a Mailcow en mail.rud1.es.
  output: "standalone",
  // Librerías de servidor que no deben pasar por webpack: hablan con sockets
  // (IMAP/SMTP) y traen dependencias opcionales nativas.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "sanitize-html", "html-to-text", "better-sqlite3", "sharp"],
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
        ],
      },
      {
        // Todas las rutas menos las de CON_CSP_PROPIA, que traen la suya.
        source: `/((?!${CON_CSP_PROPIA.join("|")}).*)`,
        headers: [
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
