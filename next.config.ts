import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
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
