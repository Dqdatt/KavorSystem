import type { NextConfig } from "next";
import pkg from "./package.json";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  transpilePackages: ["@kavor/contracts", "@kavor/web-ui"],
};

export default config;
