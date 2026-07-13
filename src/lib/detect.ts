import { browserName, detectOS } from 'detect-browser';
import ipaddr from 'ipaddr.js';
import { UAParser } from 'ua-parser-js';
import { getIpAddress } from '@/lib/ip';
import { safeDecodeURIComponent } from '@/lib/url';
import { getEnvBool, getEnvString } from '@/lib/env';

const PROVIDER_HEADERS = [
  // Umami custom headers (cloud mode only)
  ...(getEnvBool('CLOUD_MODE')
    ? [
        {
          countryHeader: 'x-umami-client-country',
          regionHeader: 'x-umami-client-region',
          cityHeader: 'x-umami-client-city',
        },
      ]
    : []),
  // Cloudflare headers
  {
    countryHeader: 'cf-ipcountry',
    regionHeader: 'cf-region-code',
    cityHeader: 'cf-ipcity',
  },
  // Vercel headers
  {
    countryHeader: 'x-vercel-ip-country',
    regionHeader: 'x-vercel-ip-country-region',
    cityHeader: 'x-vercel-ip-city',
  },
  // CloudFront headers
  {
    countryHeader: 'cloudfront-viewer-country',
    regionHeader: 'cloudfront-viewer-country-region',
    cityHeader: 'cloudfront-viewer-city',
  },
  // EdgeOne headers (requires custom request headers in Rule Priorities, see: https://edgeone.ai/document/46151)
  {
    countryHeader: 'eo-ipcountry',
    regionHeader: 'eo-region-code',
    cityHeader: 'eo-ipcity',
  },
];

export function getDevice(userAgent: string, screen: string = '') {
  const { device } = UAParser(userAgent);

  const [width] = screen.split('x');

  const type = device?.type || 'desktop';

  if (type === 'desktop' && screen && +width <= 1920) {
    return 'laptop';
  }

  return type;
}

function getRegionCode(country: string, region: string) {
  if (!country || !region) {
    return undefined;
  }

  return region.includes('-') ? region : `${country}-${region}`;
}

function decodeHeader(s: string | undefined | null): string | undefined | null {
  if (s === undefined || s === null) {
    return s;
  }

  // Latin1 to UTF-8 conversion for Cloudflare Workers
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i) & 0xff;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Lightweight local IP check for Workers. Only uses regex range matching,
 * avoids Node.js dgram/dns modules that don't exist in CF Workers.
 */
function isLocalIp(ip: string): boolean {
  // IPv4 private/local ranges
  const ipv4Ranges = [
    /^127\./,                     // loopback
    /^10\./,                      // class A private
    /^172\.(1[6-9]|2\d|3[01])/,  // class B private
    /^192\.168\./,                // class C private
    /^169\.254\./,                // link-local
    /^0\./,                       // current network
    /^100\.(6[4-9]|\d{2}|1[01]\d|12[0-7])/, // CGNAT
  ];

  // IPv6 local/private ranges
  const ipv6Ranges = [
    /^::1$/,                      // loopback
    /^::$/,
    /^fe[89ab][\da-f]:/i,        // link-local (fe80::/10)
    /^f[cd][\da-f]:/i,           // unique local (fc00::/7)
  ];

  if (ip.includes(':')) {
    return ipv6Ranges.some(r => r.test(ip));
  }
  return ipv4Ranges.some(r => r.test(ip));
}

export async function getLocation(ip: string = '', headers: Headers, skipHeaders: boolean) {
  console.log('[detect] getLocation - start, ip:', ip, 'skipHeaders:', skipHeaders);

  // Ignore local ips
  if (!ip) {
    console.log('[detect] getLocation - no ip, returning null');
    return null;
  }

  console.log('[detect] getLocation - before isLocalIp check');
  const local = isLocalIp(ip);
  console.log('[detect] getLocation - isLocalIp result:', local);

  if (local) {
    console.log('[detect] getLocation - ip is localhost, returning null');
    return null;
  }

  console.log('[detect] getLocation - before header check, skipHeaders:', skipHeaders, 'SKIP_LOCATION_HEADERS:', getEnvBool('SKIP_LOCATION_HEADERS'));

  if (!skipHeaders && !getEnvBool('SKIP_LOCATION_HEADERS')) {
    console.log('[detect] getLocation - iterating PROVIDER_HEADERS, count:', PROVIDER_HEADERS.length);
    for (let i = 0; i < PROVIDER_HEADERS.length; i++) {
      const provider = PROVIDER_HEADERS[i];
      console.log('[detect] getLocation - checking provider', i, 'countryHeader:', provider.countryHeader);
      const countryHeader = headers.get(provider.countryHeader);
      console.log('[detect] getLocation - provider', i, 'countryHeader value:', countryHeader);
      if (countryHeader) {
        console.log('[detect] getLocation - found match at provider', i);
        const country = decodeHeader(countryHeader);
        const region = decodeHeader(headers.get(provider.regionHeader));
        const city = decodeHeader(headers.get(provider.cityHeader));

        console.log('[detect] getLocation - returning location:', { country, region, city });
        return {
          country,
          region: getRegionCode(country, region),
          city,
        };
      }
    }
  }

  console.log('[detect] getLocation - no location found, returning null');
  return null;
}

export async function getClientInfo(request: Request, payload: Record<string, any>) {
  console.log('[detect] getClientInfo - start, payload keys:', Object.keys(payload || {}).join(','));

  console.log('[detect] getClientInfo - before userAgent');
  const userAgent = payload?.userAgent || request.headers.get('user-agent');
  console.log('[detect] getClientInfo - userAgent:', userAgent);

  console.log('[detect] getClientInfo - before getIpAddress');
  const ip = payload?.ip || getIpAddress(request.headers);
  console.log('[detect] getClientInfo - ip:', ip);

  console.log('[detect] getClientInfo - before getLocation');
  const location = await getLocation(ip, request.headers, !!payload?.ip);
  console.log('[detect] getClientInfo - after getLocation, location:', JSON.stringify(location));

  console.log('[detect] getClientInfo - before safeDecodeURIComponent calls');
  const country = safeDecodeURIComponent(location?.country);
  const region = safeDecodeURIComponent(location?.region);
  const city = safeDecodeURIComponent(location?.city);
  console.log('[detect] getClientInfo - after country/region/city');

  console.log('[detect] getClientInfo - before browser/os/device');
  const browser = payload?.browser ?? browserName(userAgent);
  console.log('[detect] getClientInfo - after browserName, browser:', browser);
  const os = payload?.os ?? (detectOS(userAgent) as string);
  console.log('[detect] getClientInfo - after detectOS, os:', os);
  const device = payload?.device ?? getDevice(userAgent, payload?.screen);
  console.log('[detect] getClientInfo - after getDevice, device:', device);

  console.log('[detect] getClientInfo - returning result');
  return { userAgent, browser, os, ip, country, region, city, device };
}

export function hasBlockedIp(clientIp: string) {
  const ignoreIps = getEnvString('IGNORE_IP');

  if (ignoreIps) {
    const ips = [];

    if (ignoreIps) {
      ips.push(...ignoreIps.split(',').map(n => n.trim()));
    }

    return ips.find(ip => {
      if (ip === clientIp) {
        return true;
      }

      // CIDR notation
      if (ip.indexOf('/') > 0) {
        const addr = ipaddr.parse(clientIp);
        const range = ipaddr.parseCIDR(ip);

        if (addr.kind() === range[0].kind() && addr.match(range)) {
          return true;
        }
      }

      return false;
    });
  }

  return false;
}
