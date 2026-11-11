import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Licensed stock photography used as a stand-in for real Brasaland
    // photography — see IMAGE_CREDITS.md. Swap for a local /public asset
    // (and remove this remote pattern) once real photos are available.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
