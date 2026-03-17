import { Hono } from 'hono';
import { Env } from './types/env.js';
import { authMiddleware } from './middleware/auth.js';
import { basicAuthMiddleware } from './middleware/basicAuth.js';
import { calcController } from './controllers/calc.js';
import { priceController } from './controllers/price.js';
import { stockController } from './controllers/stock.js';
import { stockSearchController } from './controllers/stockSearch.js';
import { marketController } from './controllers/market.js';
import { marketStatusController } from './controllers/marketStatus.js';
import { rateController } from './controllers/rate.js';
import { uiController } from './views/ui.js';

const app = new Hono<{ Bindings: Env }>();

// ── Public routes ──
app.get('/', basicAuthMiddleware, uiController);
app.get('/health', (c) => c.text('ok'));
// ── Protected routes ──
app.get('/calc', authMiddleware, calcController);
app.get('/price', authMiddleware, priceController);
app.get('/stock', authMiddleware, stockController);
app.get('/stock/search', authMiddleware, stockSearchController);
app.get('/market', authMiddleware, marketController);
app.get('/market-status', authMiddleware, marketStatusController);
app.get('/rate', authMiddleware, rateController);

export default app;
