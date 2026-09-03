/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * `standalone` emits a self-contained server bundle, which is what keeps the
   * Docker image small — but it breaks Netlify's Next adapter, which expects a
   * normal build and 404s everything if it finds a standalone one.
   *
   * So it is opt-in: the Dockerfile sets BUILD_STANDALONE=true, and hosted
   * platforms (Netlify, Vercel, Render) get the default build they know how to
   * deploy.
   */
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};
export default nextConfig;
