import { getBoolEnv, getEnv } from '@/lib/env';
import { CURRENT_VERSION, TELEMETRY_PIXEL } from '@/lib/constants';

export async function GET() {
  if (
    getEnv('NODE_ENV', 'development') !== 'production' ||
    getBoolEnv('DISABLE_TELEMETRY') ||
    getBoolEnv('PRIVATE_MODE')
  ) {
    return new Response('/* telemetry disabled */', {
      headers: {
        'content-type': 'text/javascript',
      },
    });
  }

  const script = `
    (()=>{const i=document.createElement('img');
      i.setAttribute('src','${TELEMETRY_PIXEL}?v=${CURRENT_VERSION}');
      i.setAttribute('style','width:0;height:0;position:absolute;pointer-events:none;');
      document.body.appendChild(i);})();
  `;

  return new Response(script.replace(/\s\s+/g, ''), {
    headers: {
      'content-type': 'text/javascript',
    },
  });
}
