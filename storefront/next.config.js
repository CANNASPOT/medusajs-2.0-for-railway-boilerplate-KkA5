const checkEnvVariables = require("./check-env-variables");

checkEnvVariables();

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        // Ensure `NEXT_PUBLIC_MEDUSA_BACKEND_URL` is defined and properly formatted
        hostname: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
          ? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/^https?:\/\//, "") // Remove protocol
          : "example.com", // Fallback hostname to prevent errors
      },
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      ...(process.env.NEXT_PUBLIC_MINIO_ENDPOINT
        ? [
          {
            protocol: "https",
            // Ensure `NEXT_PUBLIC_MINIO_ENDPOINT` is defined
            hostname: process.env.NEXT_PUBLIC_MINIO_ENDPOINT.replace(
              /^https?:\/\//,
              "" // Remove protocol if present
            ),
          },
        ]
        : []), // If undefined, don't add this entry
    ],
  },
  serverRuntimeConfig: {
    port: process.env.PORT || 3000,
  },
};

module.exports = nextConfig;
