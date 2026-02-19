import { supabase } from '@/lib/supabase';

let cachedModel: any = null;
let cachedScalers: any = null;
let lastFetched: number = 0;
const TTL_MS = 10 * 60 * 1000;

async function fetchPublicJSON(path: string) {
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!urlBase) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  const url = `${urlBase}/storage/v1/object/public/${path}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

export async function loadModel(force = false) {
  const now = Date.now();
  if (!force && cachedModel && cachedScalers && now - lastFetched < TTL_MS) {
    return { model: cachedModel, scalers: cachedScalers };
  }
  // Expect public bucket 'models'
  const model = await fetchPublicJSON('models/current/model.json').catch(() => null);
  const scalers = await fetchPublicJSON('models/current/scalers.json').catch(() => null);
  if (!model || !scalers) throw new Error('Model artifacts not available');
  cachedModel = model;
  cachedScalers = scalers;
  lastFetched = now;
  return { model, scalers };
}

export function clearModelCache() {
  cachedModel = null;
  cachedScalers = null;
  lastFetched = 0;
}
