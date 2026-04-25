import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import memberRoutes from './src/routes/member.routes.js';
import treatmentsRouter from "./src/routes/treatments.js";
import bookingsRouter from "./src/routes/bookings.js";

const app = express();
app.use((req, res, next) => {
  if (req.headers['x-shopify-shop-domain']) {
    req.url = req.url.replace('/apps/pdb', '/api');
  }
  next();
});

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// ✅ HIER EINFÜGEN (Block 1)
app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'API läuft' });
});

// ✅ HIER EINFÜGEN (Block 2)
app.get('/api/*', (req, res, next) => {
  res.set('Content-Type', 'application/json');
  next();
});

app.use('/member', memberRoutes);
app.use("/member/member", memberRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/bookings', bookingsRouter);

// Test Route
app.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'premium-system' });
});



export default app;