import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "cheerio", "bcryptjs"],
  experimental: {
    // Default Server Action bodies are 1MB. Avatars are capped at 2MB; multipart overhead needs headroom.
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
