import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';

const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];

/**
 * Fetch HTTPS qua DNS công cộng (bỏ qua DNS nội bộ đang NXDOMAIN *.b-cdn.net).
 */
export async function fetchViaPublicDns(url: string, init?: RequestInit): Promise<Response> {
  const target = new URL(url);
  const resolver = new Resolver();
  resolver.setServers(PUBLIC_DNS);

  let address: string;
  try {
    const ipv4 = await resolver.resolve4(target.hostname);
    address = ipv4[0];
  } catch {
    const ipv6 = await resolver.resolve6(target.hostname);
    address = ipv6[0];
  }

  const method = (init?.method || 'GET').toUpperCase();
  const headerBag: Record<string, string> = {
    Host: target.hostname,
    Accept: '*/*',
    // Pull zone bật hotlink / block direct URL — cần Referer hợp lệ
    Referer: process.env.BUNNY_CDN_REFERER || 'http://localhost:3003/',
    Origin: process.env.BUNNY_CDN_ORIGIN || 'http://localhost:3003',
    'User-Agent': 'Mozilla/5.0 (compatible; FabicoLearning/1.0)',
  };

  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'host') return;
      // Không cho caller ghi đè Referer/Origin (CDN hotlink)
      if (lower === 'referer' || lower === 'origin') return;
      headerBag[key] = value;
    });
  }

  const body =
    init?.body == null
      ? undefined
      : typeof init.body === 'string' || Buffer.isBuffer(init.body)
        ? init.body
        : Buffer.from(await new Response(init.body).arrayBuffer());

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        host: address,
        servername: target.hostname,
        path: `${target.pathname}${target.search}`,
        method,
        headers: headerBag,
        timeout: 30000,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
            else headers.set(key, value);
          }
          resolve(
            new Response(buf, {
              status: res.statusCode || 502,
              statusText: res.statusMessage,
              headers,
            }),
          );
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Bunny CDN request timed out'));
    });

    if (body != null) req.write(body);
    req.end();
  });
}
