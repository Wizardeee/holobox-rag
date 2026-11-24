import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '../types/api';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.holobox
      .getSettings()
      .then(setSettings)
      .catch((reason) => setError(String(reason)));
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.holobox.setSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, update, error };
}
