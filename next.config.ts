import type { NextConfig } from 'next';

// Surface build metadata to the client so the Settings panel can show which
// commit is live. On Vercel, VERCEL_GIT_COMMIT_SHA is set at build time.
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'dev';
const buildDate = process.env.VERCEL_GIT_COMMIT_DATE ?? new Date().toISOString().slice(0, 10);

const nextConfig: NextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        NEXT_PUBLIC_BUILD_SHA: buildSha,
        NEXT_PUBLIC_BUILD_DATE: buildDate,
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
