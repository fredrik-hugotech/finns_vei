/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/map', destination: '/', permanent: false },
      { source: '/meld', destination: '/', permanent: false },
      { source: '/meld/form', destination: '/', permanent: false },
    ];
  },
};

module.exports = nextConfig;
