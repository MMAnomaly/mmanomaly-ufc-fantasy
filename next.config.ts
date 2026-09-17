import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "cheerio", "bcryptjs"],
};

export default nextConfig;
