'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tiny data-fetching hook: JSON GET with abort-on-change and a reload().
 * Pass null as the url to skip fetching.
 *
 * The result is stored together with the request key it belongs to; loading
 * is derived (key mismatch) instead of being set inside the effect. The
 * previous data stays visible while the next request is in flight.
 */
export function useFetch(url) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const key = url ? `${nonce}:${url}` : null;

  useEffect(() => {
    if (!url) return undefined;
    const requestKey = `${nonce}:${url}`;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setResult({ key: requestKey, data: body, error: null });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setResult((r) => ({ key: requestKey, data: r.data, error: err }));
      });
    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: url ? result.data : null,
    error: result.key === key ? result.error : null,
    loading: Boolean(url) && result.key !== key,
    reload,
  };
}
