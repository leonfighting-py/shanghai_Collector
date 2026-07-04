import path from "node:path";

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg"],
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
