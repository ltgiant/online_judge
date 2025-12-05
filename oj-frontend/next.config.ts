import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow public IP to load dev assets (_next/*) without CORS warnings.
  allowedDevOrigins: [
    // public
    "35.216.0.27",
  ],
};

export default nextConfig;
