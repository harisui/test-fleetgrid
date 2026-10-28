import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // forbidden() in the admin guard: a non-admin gets a real 403 page (src/app/forbidden.tsx).
    authInterrupts: true,
  },
};

export default nextConfig;
