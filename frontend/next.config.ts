import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Ye Render aur Docker ke liye magic switch hai
};

export default nextConfig;