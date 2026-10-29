// Same routes as main's server/src/index.js, minus the HTTP server and static files.
import express from 'express';
import fisRouter from '../../../server/src/fis/router.js';
import apiRouter from '../../../server/src/routes/api.js';
import demoRouter from '../../../server/src/routes/demo.js';

export { scoreCommunity } from '../../../server/src/lib/community.js';

export const app = express();
app.use('/fis/v1', fisRouter); // fake FIS core (demo only)
app.use('/api/demo', demoRouter); // demo tab: database, model and population views
app.use('/api', apiRouter); // Helping Hands
