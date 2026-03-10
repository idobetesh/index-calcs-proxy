import { Hono } from 'hono';
import { Env } from './types/index.js';
import { authMiddleware } from './middleware/auth.js';
import { basicAuthMiddleware } from './middleware/basicAuth.js';
import { calcController } from './controllers/calc.js';
import { latestController } from './controllers/latest.js';
import { marketController } from './controllers/market.js';
import { uiController } from './controllers/ui.js';

const app = new Hono<{ Bindings: Env }>();

// ── Public routes ──
app.get('/', basicAuthMiddleware, uiController);
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));
app.get('/latest', latestController);
app.get('/market', marketController);

// ── Protected routes ──
app.get('/calc', authMiddleware, calcController);

export default app;
