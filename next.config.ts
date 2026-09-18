import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/api/**": ["./public/gentwelve-document-logo.png"] },
};

export default nextConfig;
