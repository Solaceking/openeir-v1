import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // tesseract.js resolves worker/wasm paths at runtime from node_modules —
  // it must stay external (not bundled) or its path resolution breaks.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
