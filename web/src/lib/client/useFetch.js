'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tiny data-fetching hook: JSON GET with abort-on-change and a reload().
 * Pass null as the url to skip fetching.
 */
export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setState({ data: body, error: null, loading: false });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState((s) => ({ ...s, error: err, loading: false }));
      });
    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
