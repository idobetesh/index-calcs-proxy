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
import { fearGreedController } from './controllers/fearGreed.js';
import { managementFeeController } from './controllers/managementFee.js';
import { dividendController } from './controllers/dividend.js';
import { aaiiSentimentController } from './controllers/aaiiSentiment.js';
import { latestController } from './controllers/latest.js';
import { uiController } from './views/ui.js';

const app = new Hono<{ Bindings: Env }>();

// ── Public routes ──
app.get('/', basicAuthMiddleware, uiController);
app.get('/health', (c) => c.text('ok'));
// ── Protected routes ──
app.get('/calc', authMiddleware, calcController);
app.get('/latest', authMiddleware, latestController);
app.get('/price', authMiddleware, priceController);
app.get('/stock', authMiddleware, stockController);
app.get('/stock/search', authMiddleware, stockSearchController);
app.get('/market', authMiddleware, marketController);
app.get('/market-status', authMiddleware, marketStatusController);
app.get('/rate', authMiddleware, rateController);
app.get('/fear-greed', authMiddleware, fearGreedController);
app.get('/mgmt-fee', authMiddleware, managementFeeController);
app.get('/dividend', authMiddleware, dividendController);
app.get('/aaii-sentiment', authMiddleware, aaiiSentimentController);

export default app;
