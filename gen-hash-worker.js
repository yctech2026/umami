export default {
  async fetch(request, env) {
    try {
      const encoder = new TextEncoder();

      function bytesToHex(bytes) {
        let hex = '';
        for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
        return hex;
      }
      function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        return bytes;
      }

      async function pepperPassword(password) {
        const pepperStr = env.PEPPER_KEY ?? '';
        const pepper = encoder.encode(pepperStr);
        const key = await crypto.subtle.importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return crypto.subtle.sign('HMAC', key, encoder.encode(password));
      }

      async function checkPassword(password, stored) {
        const [salt, storedHash] = stored.split(':');
        const peppered = await pepperPassword(password);
        const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
        const computed = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: hexToBytes(salt), iterations: 10000, hash: 'SHA-256' },
          keyMaterial, 256
        );
        return bytesToHex(new Uint8Array(computed)) === storedHash;
      }

      const url = new URL(request.url);

      // 自测：生成哈希并验证
      if (url.pathname === '/self-test') {
        const pw = 'umami';
        
        // Generate hash using same algorithm as Umami
        const peppered = await pepperPassword(pw);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const saltHex = bytesToHex(salt);
        const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
        const derived = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
          keyMaterial, 256
        );
        const hash = `${saltHex}:${bytesToHex(new Uint8Array(derived))}`;

        const verify = await checkPassword(pw, hash);
        
        return new Response(JSON.stringify({
          password: pw,
          generated_hash: hash,
          self_verify: verify ? 'PASS' : 'FAIL',
          pepper_key: env.PEPPER_KEY ?? '(not set)',
          pepper_len: (env.PEPPER_KEY ?? '').length,
          note: 'If self_verify=PASS, the worker can correctly generate & verify hashes',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 测试一个指定的哈希
      if (url.pathname === '/verify') {
        const hash = url.searchParams.get('hash') || '';
        const pw = url.searchParams.get('password') || 'umami';
        
        if (!hash) {
          return new Response(JSON.stringify({ error: 'Provide ?hash=xxx&password=xxx' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const result = await checkPassword(pw, hash);
        return new Response(JSON.stringify({
          password: pw,
          hash,
          matches: result,
          pepper_key: env.PEPPER_KEY ?? '(not set)',
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 生成新哈希
      const pw = 'umami';
      const peppered = await pepperPassword(pw);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = bytesToHex(salt);
      const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
      const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
        keyMaterial, 256
      );
      const hash = `${saltHex}:${bytesToHex(new Uint8Array(derived))}`;

      return new Response(JSON.stringify({
        password: pw,
        hash,
        pepper_key: env.PEPPER_KEY ?? '(not set)',
        pepper_len: (env.PEPPER_KEY ?? '').length,
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, name: e.name }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
