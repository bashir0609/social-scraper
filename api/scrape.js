import { handler as netlifyStyleHandler } from '../netlify/functions/scrape.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  const bodyString = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body ?? {});

  const result = await netlifyStyleHandler({
    httpMethod: method,
    body: bodyString,
  });

  const headers = result?.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  const statusCode = Number(result?.statusCode || 200);
  const rawBody = result?.body ?? '';
  let payload = rawBody;

  if (typeof rawBody === 'string' && headers['content-type']?.includes('application/json')) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }
  }

  res.status(statusCode).send(payload);
}

