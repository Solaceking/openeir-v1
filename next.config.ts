import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Real app version, inlined at build time (read by /api/health).
  env: {
    APP_VERSION: pkg.version,
  },
  // tesseract.js resolves worker/wasm paths at runtime from node_modules —
  // it must stay external (not bundled) or its path resolution breaks.
  // msedge-tts opens its own WebSocket to the Edge speech service — keep it
  // external so the standalone bundle doesn't try to inline its transport.
  serverExternalPackages: ["tesseract.js", "msedge-tts"],
  // Opt-in realtime voice agent (docker compose --profile voice). The
  // browser posts its WebRTC offer straight through to the Pipecat container
  // — no separate signaling infra. Absent in the default deployment.
  async rewrites() {
    return process.env.VOICE_AGENT_URL
      ? [{ source: "/voice-agent/:path*", destination: `${process.env.VOICE_AGENT_URL}/:path*` }]
      : []
  },
};

export default nextConfig;
