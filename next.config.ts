import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin은 서버에서만 실행, 브라우저 번들 제외
  serverExternalPackages: ['firebase-admin'],

  // 이미지 최적화
  images: {
    domains: [],
  },

  // 헤더 설정 (PWA Service Worker 범위)
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
