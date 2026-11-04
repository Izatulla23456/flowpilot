import type { Workflow } from 'core/types';

const TOKEN_KEY = 'flowpilot_admin_token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export class ApiAuthError extends Error {}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...init
  });
  if (res.status === 401) {
    const e = new ApiAuthError('Требуется админ-токен');
    throw e;
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export const api = {
  listWorkflows: () => req<Workflow[]>('/api/workflows'),
  createWorkflow: (body?: any) => req<Workflow>('/api/workflows', { method: 'POST', body: JSON.stringify(body || {}) }),
  saveWorkflow: (wf: Workflow) =>
    req<Workflow>(`/api/workflows/${wf.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: wf.name, nodes: wf.nodes, edges: wf.edges })
    }),
  deleteWorkflow: (id: string) => req(`/api/workflows/${id}`, { method: 'DELETE' }),
  run: (id: string) => req<{ ok: boolean; error?: string; output?: any }>(`/api/workflows/${id}/run`, { method: 'POST', body: '{}' }),
  history: (id: string) => req<any[]>(`/api/workflows/${id}/history`),
  templates: () => req<Array<{ name: string; description: string }>>('/api/templates'),
  aiGenerate: (prompt: string) => req<{ workflow: Workflow; ai: string }>('/api/ai/generate', { method: 'POST', body: JSON.stringify({ prompt }) }),
  aiExplain: (workflowId: string) => req<{ text: string; ai: string }>('/api/ai/explain', { method: 'POST', body: JSON.stringify({ workflowId }) }),
  aiFix: (workflowId: string, nodeId: string) =>
    req<{ fixed: Record<string, any> | null; advice: string; ai: string }>('/api/ai/fix', {
      method: 'POST',
      body: JSON.stringify({ workflowId, nodeId })
    }),
  aiTests: (workflowId: string) =>
    req<{ tests: Array<{ name: string; method: string; url: string; body: string; expect: string }>; ai: string }>('/api/ai/tests', {
      method: 'POST',
      body: JSON.stringify({ workflowId })
    }),
  metrics: () => req<any>('/api/metrics'),
  getSettings: () => req<any>('/api/settings'),
  saveSettings: (s: any) => req<any>('/api/settings', { method: 'PUT', body: JSON.stringify(s) })
};
