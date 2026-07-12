import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';
import pkg from './package.json' with { type: 'json' };
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const TRACKER_SCRIPT = '/script.js';

const isProd = process.env.NODE_ENV === 'production';

const basePath = process.env.BASE_PATH || '';
const cloudMode = process.env.CLOUD_MODE || '';
const cloudUrl = process.env.CLOUD_URL || '';
const collectApiEndpoint = process.env.COLLECT_API_ENDPOINT || '';
const corsMaxAge = process.env.CORS_MAX_AGE || '';
const defaultCurrency = process.env.DEFAULT_CURRENCY || '';
const defaultLocale = process.env.DEFAULT_LOCALE || '';
const forceSSL = process.env.FORCE_SSL || '';
const frameAncestors = process.env.ALLOWED_FRAME_URLS || '';
const trackerScriptName = process.env.TRACKER_SCRIPT_NAME || '';
const trackerScriptURL = process.env.TRACKER_SCRIPT_URL || '';
const selfTrack = process.env.UMAMI_SELF_TRACK || '';
const selfRecord = process.env.UMAMI_SELF_RECORD || '';

const contentSecurityPolicy = `
  default-src 'self';
  img-src 'self' https: data:;
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https:;
  frame-ancestors 'self' ${frameAncestors};
`;

const defaultHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy.replace(/\s{2,}/g, ' ').trim(),
  },
];

if (forceSSL) {
  defaultHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

const trackerHeaders = [
  {
    key: 'Access-Control-Allow-Origin',
    value: '*',
  },
  {
    key: 'Cache-Control',
    value: 'public, max-age=86400, must-revalidate',
  },
];

const apiHeaders = [
  {
    key: 'Access-Control-Allow-Origin',
    value: '*',
  },
  {
    key: 'Access-Control-Allow-Headers',
    value: '*',
  },
  {
    key: 'Access-Control-Allow-Methods',
    value: 'GET, DELETE, POST, PUT',
  },
  {
    key: 'Access-Control-Max-Age',
    value: corsMaxAge || '86400',
  },
  {
    key: 'Cache-Control',
    value: 'no-cache',
  },
];

const headers = [
  {
    source: '/api/:path*',
    headers: apiHeaders,
  },
  {
    source: '/:path*',
    headers: defaultHeaders,
  },
];

if (isProd) {
  headers.push({
    source: TRACKER_SCRIPT,
    headers: trackerHeaders,
  });
}

const rewrites = [];

if (trackerScriptURL) {
  rewrites.push({
    source: TRACKER_SCRIPT,
    destination: trackerScriptURL,
  });
}

if (collectApiEndpoint) {
  headers.push({
    source: collectApiEndpoint,
    headers: apiHeaders,
  });

  rewrites.push({
    source: collectApiEndpoint,
    destination: '/api/send',
  });
}

const redirects = [
  {
    source: '/teams/:id/dashboard/edit',
    destination: '/dashboard/edit',
    permanent: false,
  },
  {
    source: '/teams/:id/dashboard',
    destination: '/dashboard',
    permanent: false,
  },
  {
    source: '/settings',
    destination: '/settings/preferences',
    permanent: false,
  },
  {
    source: '/teams/:id',
    destination: '/teams/:id/websites',
    permanent: false,
  },
  {
    source: '/teams/:id/settings',
    destination: '/teams/:id/settings/preferences',
    permanent: false,
  },
  {
    source: '/admin',
    destination: '/admin/users',
    permanent: false,
  },
];

// Adding rewrites + headers for all alternative tracker script names.
if (trackerScriptName) {
  const names = trackerScriptName?.split(',').map(name => name.trim());

  if (names) {
    names.forEach(name => {
      const normalizedSource = `/${name.replace(/^\/+/, '')}`;

      rewrites.push({
        source: normalizedSource,
        destination: TRACKER_SCRIPT,
      });

      headers.push({
        source: normalizedSource,
        headers: trackerHeaders,
      });
    });
  }
}

if (isProd && cloudMode) {
  rewrites.push({
    source: '/script.js',
    destination: 'https://cloud.umami.is/script.js',
  });
}

/** @type {import('next').NextConfig} */
export default withNextIntl({
  reactStrictMode: false,

  env: {
    basePath,
    cloudMode,
    cloudUrl,
    currentVersion: pkg.version,
    defaultCurrency,
    defaultLocale,
    selfTrack,
    selfRecord,
  },
  basePath,
  output: isProd ? 'standalone' : undefined,
  transpilePackages: ['@umami/react-zen'],
  serverExternalPackages: ['@libsql/client', '@libsql/isomorphic-ws'],
  experimental: {
    serverMinification: true,
    optimizePackageImports: [
      'immer',
      'lucide-react',
      'react-icons',
      'recharts',
      'date-fns',
      '@tanstack/react-query',
      'zustand',
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  devIndicators: false,
  images: {
    unoptimized: true, // Cloudflare Workers 不支持图片优化
  },
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { isServer, webpack, dev }) => {
    // 移除所有现有 CSS 规则，由我们统一处理所有 CSS
    // 必须这样做，因为我们使用 postcss-loader 处理 Tailwind v4 @layer 语法
    config.module.rules = config.module.rules.filter(
      rule => !(rule.test && typeof rule.test === 'object' && rule.test.toString().includes('\\.css$'))
    );

    // 生产环境用 MiniCssExtractPlugin.loader 提取独立 CSS 文件，消除 FOUC
    // 开发环境保留 style-loader 实现 HMR
    const cssLoader = dev
      ? 'style-loader'
      : MiniCssExtractPlugin.loader;

    if (!dev) {
      config.plugins.push(new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[id].[contenthash:8].css',
      }));
    }

    // 处理 @umami/react-zen 的 CSS（Tailwind v4 @layer 语法需要 postcss-loader）
    config.module.rules.push({
      test: /node_modules\/@umami\/react-zen.*\.css$/,
      use: [
        cssLoader,
        { loader: 'css-loader', options: { importLoaders: 1 } },
        'postcss-loader',
      ],
    });

    // 处理应用自身的 CSS（global.css 等）
    config.module.rules.push({
      test: /\.css$/,
      exclude: /node_modules/,
      use: [
        cssLoader,
        { loader: 'css-loader', options: { importLoaders: 1 } },
        'postcss-loader',
      ],
    });

    if (isServer) {
      config.optimization.minimize = true;
    }
    return config;
  },

  async headers() {
    return headers;
  },
  async rewrites() {
    return [
      ...rewrites,
      {
        source: '/telemetry.js',
        destination: '/api/scripts/telemetry',
      },
      {
        source: '/teams/:teamId/:path*',
        destination: '/:path*',
      },
    ];
  },
  async redirects() {
    return [...redirects];
  },
});

// 使用 Webpack 时正常初始化 OpenNext Cloudflare Dev
initOpenNextCloudflareForDev();
