import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // tesseract.js resolves worker/wasm paths at runtime from node_modules —
  // it must stay external (not bundled) or its path resolution breaks.
  // msedge-tts opens its own WebSocket to the Edge speech service — keep it
  // external so the standalone bundle doesn't try to inline its transport.
  serverExternalPackages: ["tesseract.js", "msedge-tts"],
};

export default nextConfig;
