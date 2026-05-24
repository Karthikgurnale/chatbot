import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the body parser size limit for file uploads (PDF, images)
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
