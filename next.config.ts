import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Payroll PDFs can be a few MB once base64-encoded. Default 1MB chokes.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
