import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone', // Creates self-contained production build
    async rewrites() {
        return [
            {
                source: '/yahoo-finance/:path*',
                destination: 'https://query1.finance.yahoo.com/:path*'
            }
        ];
    }
};

export default nextConfig;
