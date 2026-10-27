import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fisRouter from './fis/router.js';
import apiRouter from './routes/api.js';
import demoRouter from './routes/demo.js';
import { core } from './fis/store.js';
import { scoreCommunity } from './lib/community.js';

const PORT = Number(process.env.PORT || 4000);
const app = express();
app.disable('x-powered-by');

app.use('/fis/v1', fisRouter); // fake FIS core (demo only)
app.use('/api/demo', demoRouter); // demo tab: database, model and population views
app.use('/api', apiRouter); // Helping Hands

// Production: serve the built client and fall back to index.html for client-side routes.
const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api|fis).*/, (req, res) => res.sendFile(`${dist}index.html`));
}

app.listen(PORT, () => {
  console.log(`Helping Hands API   http://localhost:${PORT}/api`);
  console.log(`Fake FIS core       http://localhost:${PORT}/fis/v1  (data as of ${core.meta.asOfDt}, ${core.simulated} simulated households)`);
  // The "nightly" scoring job: run the income model over the community through the FIS adapter.
  scoreCommunity().catch((err) => console.error('Community scoring failed:', err.message));
});
