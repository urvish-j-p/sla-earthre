/**
 * Local stand-in for the Lambda Function URL, for development only.
 * It converts HTTP requests to the Function URL event shape (payload v2.0) and
 * calls the real handler, so the code path is identical to production.
 *
 *   npm run dev   ->  http://localhost:3001
 */
import { createServer } from 'node:http';
import { handler } from '../src/handler.js';

const PORT = Number(process.env.INGEST_PORT ?? 3001);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-file-name',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const event = {
    requestContext: { http: { method: req.method, path: req.url } },
    headers: req.headers,
    body: Buffer.concat(chunks).toString('base64'),
    isBase64Encoded: true,
  };
  const result = await handler(event, { awsRequestId: `local-${Date.now()}` });
  res.writeHead(result.statusCode, { ...result.headers, ...CORS }).end(result.body);
}).listen(PORT, () => console.log(`ingest function listening on http://localhost:${PORT}`));
