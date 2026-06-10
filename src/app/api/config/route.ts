import { getEnv, getBoolEnv } from '@/lib/env';
import { parseRequest } from '@/lib/request';
import { CURRENT_VERSION } from '@/lib/constants';
import { json } from '@/lib/response';

export async function GET(request: Request) {
  const { error } = await parseRequest(request, null, { skipAuth: true });

  if (error) {
    return error();
  }

  return json({
    cloudMode: getBoolEnv('CLOUD_MODE'),
    faviconUrl: getEnv('FAVICON_URL', ''),
    linksUrl: getEnv('LINKS_URL', ''),
    pixelsUrl: getEnv('PIXELS_URL', ''),
    privateMode: getBoolEnv('PRIVATE_MODE'),
    telemetryDisabled: getBoolEnv('DISABLE_TELEMETRY'),
    trackerScriptName: getEnv('TRACKER_SCRIPT_NAME', ''),
    updatesDisabled: getBoolEnv('DISABLE_UPDATES'),
    currentVersion: CURRENT_VERSION,
  });
}
