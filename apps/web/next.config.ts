import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@peron/types"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: "peron-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
});
