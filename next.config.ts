import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Surface build metadata to the client so the Settings panel can show which
// commit is live. On Vercel, VERCEL_GIT_COMMIT_SHA is set at build time.
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'dev';
const buildDate = process.env.VERCEL_GIT_COMMIT_DATE ?? new Date().toISOString().slice(0, 10);

// Monotonic build number = total git commit count. It increments by exactly 1
// on every commit from any source (local, CI, GitHub web edit, another clone),
// with no manual bump — it's a property of history, not a file we maintain.
// Combined with the package.json semver to form a checkable version, e.g.
// "0.1.0+248". Requires full git history at build time (Vercel clones full by
// default); falls back to the bare semver if git is unavailable.
function gitCommitCount(): string {
    try {
        return execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return '';
    }
}
const baseVersion = (() => {
    try {
        return (JSON.parse(readFileSync('./package.json', 'utf8')).version as string) ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
})();
const buildNumber = gitCommitCount();
const appVersion = buildNumber ? `${baseVersion}+${buildNumber}` : baseVersion;

const nextConfig: NextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        NEXT_PUBLIC_BUILD_SHA: buildSha,
        NEXT_PUBLIC_BUILD_DATE: buildDate,
        NEXT_PUBLIC_APP_VERSION: appVersion,
        NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
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
