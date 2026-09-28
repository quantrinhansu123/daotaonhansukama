import https from 'node:https';
import { Readable } from 'node:stream';
import { Resolver } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';

const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
const ADDRESS_TTL_MS = 10 * 60 * 1000;
const addressCache = new Map<string, { address: string; expiresAt: number }>();

/**
 * Fetch HTTPS qua DNS công cộng (bỏ qua DNS nội bộ đang NXDOMAIN *.b-cdn.net).
 */
async function resolvePublicAddress(hostname: string): Promise<string> {
  const cached = addressCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.address;

  const resolver = new Resolver();
  resolver.setServers(PUBLIC_DNS);
  let address: string;
  try {
    const ipv4 = await resolver.resolve4(hostname);
    address = ipv4[0];
  } catch {
    const ipv6 = await resolver.resolve6(hostname);
    address = ipv6[0];
  }
  addressCache.set(hostname, { address, expiresAt: Date.now() + ADDRESS_TTL_MS });
  return address;
}

function headersFromIncoming(res: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else headers.set(key, value);
  }
  return headers;
}

async function requestViaPublicDns(url: string, init?: RequestInit): Promise<IncomingMessage> {
  const target = new URL(url);
  const address = await resolvePublicAddress(target.hostname);
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

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: address,
        servername: target.hostname,
        path: `${target.pathname}${target.search}`,
        method,
        headers: headerBag,
        timeout: 30000,
      },
      (res: IncomingMessage) => resolve(res),
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

export async function fetchViaPublicDns(url: string, init?: RequestInit): Promise<Response> {
  const res = await requestViaPublicDns(url, init);
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Response(Buffer.concat(chunks), {
    status: res.statusCode || 502,
    statusText: res.statusMessage,
    headers: headersFromIncoming(res),
  });
}

/** Giữ luồng segment video, không chờ tải hết file rồi mới trả về trình duyệt. */
export async function streamViaPublicDns(url: string, init?: RequestInit): Promise<Response> {
  const res = await requestViaPublicDns(url, init);
  const headers = headersFromIncoming(res);
  const status = res.statusCode || 502;
  if (status >= 400) {
    const chunks: Buffer[] = [];
    for await (const chunk of res) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return new Response(Buffer.concat(chunks), { status, statusText: res.statusMessage, headers });
  }

  return new Response(Readable.toWeb(res) as ReadableStream, {
    status,
    statusText: res.statusMessage,
    headers,
  });
}
