const DEFAULT_LOCAL_API_BASE = 'http://localhost:8001';
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const LOCAL_DEV_PORTS = new Set(['3000', '3001', '5173', '4173']);

const resolveApiBaseUrl = () => {
  const envValue = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
  if (envValue) {
    return envValue.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_API_BASE;
  }

  const { protocol, hostname, port, origin } = window.location;

  if (LOCAL_DEV_PORTS.has(port)) {
    return `${protocol}//${hostname}:8001`;
  }

  if (LOCALHOST_HOSTNAMES.has(hostname)) {
    return DEFAULT_LOCAL_API_BASE;
  }

  return origin.replace(/\/$/, '');
};

export const API_BASE_URL = resolveApiBaseUrl();
