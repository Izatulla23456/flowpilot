import type { Workflow } from 'core/types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
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
  getSettings: () => req<any>('/api/settings'),
  saveSettings: (s: any) => req<any>('/api/settings', { method: 'PUT', body: JSON.stringify(s) })
};
