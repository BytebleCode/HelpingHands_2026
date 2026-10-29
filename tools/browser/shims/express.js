// In-browser stand-in for the parts of Express the Helping Hands server uses: routers mounted on
// path prefixes, :param routes, use() middleware with next(), and req.get / res.status / res.json.

const compile = (path) => {
  const keys = [];
  const source = path.replace(/\/:([A-Za-z]+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; });
  return { re: new RegExp(`^${source}/?$`), keys };
};

// Runs one handler. Handlers either respond, call next(), or return a promise that settles after
// doing one of those, which is true of every handler in the server.
async function call(fn, req, res) {
  let nexted = false;
  let error;
  await fn(req, res, (err) => { nexted = true; error = err; });
  if (error) throw error;
  return nexted && !res.done ? 'next' : 'done';
}

function Router() {
  const stack = [];
  const router = (req, res, next) => router.handle(req, res).then((r) => { if (r === 'next') next(); });

  router.use = (prefix, fn) => {
    if (typeof prefix === 'function') stack.push({ prefix: '', fn: prefix });
    else stack.push({ prefix: prefix.replace(/\/$/, ''), fn });
    return router;
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path, ...fns) => {
      if (typeof path !== 'string') throw new Error(`Only string routes are supported (${method})`);
      stack.push({ method: method.toUpperCase(), ...compile(path), fns });
      return router;
    };
  }

  router.handle = async (req, res) => {
    for (const layer of stack) {
      if (res.done) return 'done';
      if (layer.method) {
        if (layer.method !== req.method) continue;
        const m = layer.re.exec(req.path);
        if (!m) continue;
        req.params = Object.fromEntries(layer.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        for (const fn of layer.fns) if ((await call(fn, req, res)) !== 'next') return 'done';
        continue;
      }
      const { prefix } = layer;
      if (prefix && req.path !== prefix && !req.path.startsWith(`${prefix}/`)) continue;
      const path = req.path;
      req.path = path.slice(prefix.length) || '/';
      const result = await call(layer.fn, req, res);
      req.path = path;
      if (result !== 'next') return 'done';
    }
    return 'next';
  };
  return router;
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function express() {
  const app = Router();
  app.disable = () => app;
  /** Handles one request in memory, like an HTTP round trip (bodies are copied both ways). */
  app.request = async ({ method = 'GET', url, headers = {}, body }) => {
    const parsed = new URL(url, 'http://hh.local');
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const req = {
      method: method.toUpperCase(), path: parsed.pathname, query: Object.fromEntries(parsed.searchParams),
      body: clone(body) ?? {}, headers: lower, params: {}, get: (name) => lower[name.toLowerCase()],
    };
    const res = {
      statusCode: 200, headers: {}, body: null, done: false,
      status(code) { this.statusCode = code; return this; },
      set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
      json(value) { this.body = clone(value) ?? null; this.done = true; return this; },
      sendStatus(code) { this.statusCode = code; this.done = true; return this; },
    };
    try {
      if ((await app.handle(req, res)) === 'next' && !res.done) res.status(404).json({ error: 'Not found' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong' });
    }
    return { status: res.statusCode, headers: res.headers, body: res.body };
  };
  return app;
}

express.Router = Router;
express.json = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();

export default express;
