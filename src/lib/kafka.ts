import debug from 'debug';

const log = debug('umami:kafka');

// 在 Cloudflare Workers 环境下，Kafka TCP 长连接不可用
// 此处保留接口但使用空实现存根

const enabled = false;

function getClient() {
  console.warn('[kafka] Kafka is disabled in Cloudflare Workers environment (TCP not supported)');
  return null;
}

async function getProducer() {
  console.warn('[kafka] Kafka is disabled in Cloudflare Workers environment (TCP not supported)');
  return null;
}

async function sendMessage(
  topic: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message: Record<string, string | number> | Record<string, string | number>[],
): Promise<void> {
  console.warn(`[kafka] Dropped message to topic "${topic}": Kafka is disabled in Cloudflare Workers`);
  return Promise.resolve();
}

async function connect() {
  console.warn('[kafka] Kafka is disabled in Cloudflare Workers environment (TCP not supported)');
  return null;
}

export default {
  enabled,
  client: null,
  producer: null,
  log,
  connect,
  sendMessage,
};
