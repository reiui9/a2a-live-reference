import express from 'express';

export type AgentRow = {
  id: number;
  name?: string;
  endpoint?: string;
  capabilities?: string[];
  created_at: string;
  [k: string]: unknown;
};

export function createRegistryApp(apiKey = process.env.REGISTRY_API_KEY || 'dev_registry_key') {
  const app = express();
  app.use(express.json());
  const agents: AgentRow[] = [];

  function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if ((req.header('x-registry-key') || '') !== apiKey) return res.status(401).json({ error: 'unauthorized' });
    next();
  }

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'registry' }));
  app.post('/agents/register', auth, (req, res) => {
    const row: AgentRow = { id: agents.length + 1, ...req.body, created_at: new Date().toISOString() };
    agents.push(row);
    res.status(201).json(row);
  });
  app.get('/discover', (req, res) => {
    const capability = String(req.query.capability || '');
    const rows = capability ? agents.filter(a => (a.capabilities || []).includes(capability)) : agents;
    res.json({ count: rows.length, rows });
  });

  return app;
}

const isDirectRun = process.argv[1] && process.argv[1].includes('packages/registry/src/index.ts');
if (isDirectRun) {
  const port = Number(process.env.REGISTRY_PORT || 8081);
  const app = createRegistryApp();
  app.listen(port, () => console.log(`[registry] listening on :${port}`));
}
