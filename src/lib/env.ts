/**
 * 环境变量访问工具，兼容 CF Workers + Node.js
 */
export function getEnv(key: string, defaultValue?: string): string {
  // Node.js 环境 - 直接取值（兼容 Next.js DefinePlugin 和内联替换）
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key] as string | undefined;
    if (val !== undefined) return val;
  }
  // Cloudflare Workers 环境 - env 通过全局变量注入
  try {
    // @ts-ignore - CF Workers 中 env 是全局的
    if (typeof env !== 'undefined' && Object.prototype.hasOwnProperty.call(env, key)) {
      // @ts-ignore
      const val = env[key];
      if (val || defaultValue === undefined) return val;
      return defaultValue;
    }
  } catch {
    // ignore
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Environment variable ${key} is not set`);
}

/**
 * 获取字符串型环境变量（别名，兼容现有使用）
 */
export const getEnvString = getEnv;

/**
 * 获取布尔型环境变量
 */
export function getBoolEnv(key: string, defaultValue = false): boolean {
  try {
    const value = getEnv(key, defaultValue !== undefined ? String(defaultValue) : undefined);
    return value === 'true' || value === '1';
  } catch {
    return defaultValue;
  }
}

/**
 * 获取布尔型环境变量（别名，兼容现有使用）
 */
export function getEnvBool(key: string, defaultValue = false): boolean {
  return getBoolEnv(key, defaultValue);
}
