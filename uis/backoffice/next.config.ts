import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AuthPanel reuses the same pre-existing Unsplash photo already used
    // by uis/brasaland-web — see that component's own comment for the
    // exact URL and license. Remove once real Brasaland photography
    // replaces it.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
