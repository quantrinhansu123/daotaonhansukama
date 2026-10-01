import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/admin/:path*',
        destination: '/student',
        permanent: false,
      },
      {
        source: '/admin',
        destination: '/student',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
