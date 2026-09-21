import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Explicitly allow this app's own use of the camera (photo proof)
        // and geolocation (outlet check-in) APIs for every route. There
        // was no Permissions-Policy header before this — this only adds
        // one, it doesn't relax an existing restriction.
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
