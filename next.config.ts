import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.STILLWORD_TEST_SERVER === "1" ? ".next-test" : ".next",
};
export default nextConfig;
