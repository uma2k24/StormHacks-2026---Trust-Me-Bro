import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The voice classifier is loaded from disk at request time, so a build has to carry it along.
  outputFileTracingIncludes: {
    "/api/voice/analyze": ["./models/**/*"],
  },
};

export default nextConfig;
