/**
 * 一次性 Worker：在 CF Workers 运行时环境生成 Umami 密码哈希
 * 部署后访问 GET / 即可看到生成的哈希
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const encoder = new TextEncoder();

    function bytesToHex(bytes: Uint8Array): string {
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    }

    async function hashPassword(password: string) {
      // 1. Pepper - 获取当前环境的 PEPPER_KEY
      let pepperStr = '';
      try {
        // @ts-ignore
        pepperStr = env.PEPPER_KEY ?? '';
      } catch { /* ignore */ }
      console.log('PEPPER_KEY:', JSON.stringify(pepperStr));
      const pepper = encoder.encode(pepperStr);

      // 2. HMAC-SHA256(pepper, password)
      const key = await crypto.subtle.importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const peppered = await crypto.subtle.sign('HMAC', key, encoder.encode(password));

      // 3. 随机盐
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = bytesToHex(salt);

      // 4. PBKDF2-SHA-256
      const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
      const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
        keyMaterial, 256
      );

      return `${saltHex}:${bytesToHex(new Uint8Array(derived))}`;
    }

    const url = new URL(request.url);
    if (url.pathname === '/') {
      const hash = await hashPassword('umami');
      const html = `
<html><body style="font-family:monospace;padding:2em">
<h2>Umami Hash Generator</h2>
<p><b>Password:</b> umami</p>
<p><b>Hash:</b> <code>${hash}</code></p>
<p><b>PEPPER_KEY:</b> <code>${(() => { try { return (globalThis as any).env?.PEPPER_KEY ?? '(not set)'; } catch { return '(error)'; } })()}</code></p>
<hr/>
<p>Use this SQL to update:</p>
<code>UPDATE user SET password='${hash}' WHERE username='admin';</code>
</body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // JSON API
    if (url.pathname === '/json') {
      const hash = await hashPassword('umami');
      let pepperVal = '(error)';
      try { pepperVal = (globalThis as any).env?.PEPPER_KEY ?? '(not set)'; } catch {}
      return Response.json({ password: 'umami', hash, pepper_key: pepperVal, pepper_len: pepperVal.length });
    }

    return new Response('Use GET / or /json');
  },
};
