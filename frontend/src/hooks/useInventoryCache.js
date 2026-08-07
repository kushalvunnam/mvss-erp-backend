import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';

const cacheRef = { parts: null, labour: null };

export function useInventoryCache(token, type = 'parts') {
  const [data, setData] = useState(() => (type === 'parts' ? cacheRef.parts : cacheRef.labour) || []);
  const [loading, setLoading] = useState(() => {
    const cached = type === 'parts' ? cacheRef.parts : cacheRef.labour;
    return !cached;
  });
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    const cached = type === 'parts' ? cacheRef.parts : cacheRef.labour;
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const doFetch = async () => {
      try {
        const headers = { Authorization: `Bearer ${tokenRef.current}` };
        const res = await fetch(`${API_BASE_URL}/inventory`, { headers });
        if (!res.ok) return;
        const all = await res.json();

        if (!cacheRef.parts) cacheRef.parts = all.filter(i => i.type !== 'Labour');
        if (!cacheRef.labour) cacheRef.labour = all.filter(i => i.type === 'Labour');

        if (!cancelled) {
          setData(type === 'parts' ? cacheRef.parts : cacheRef.labour);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [type]);

  return { data, loading };
}

export function clearInventoryCache() {
  cacheRef.parts = null;
  cacheRef.labour = null;
}
