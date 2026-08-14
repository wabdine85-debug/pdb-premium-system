import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './src/config/env.js';
import memberRoutes from './src/routes/member.routes.js';
import treatmentsRouter from "./src/routes/treatments.js";
import bookingsRouter from "./src/routes/bookings.js";
import contractsRouter from './src/routes/contracts.js';

const app = express();
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
app.set('trust proxy', 1);
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

export function redirectRootToAdmin(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res.redirect(302, '/admin/contracts');
}

app.get('/', redirectRootToAdmin);

app.get('/admin/contracts', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res.sendFile('admin-contracts.html', { root: publicDirectory });
});
app.use('/admin/assets', express.static(path.join(publicDirectory, 'admin-assets'), {
  fallthrough: false,
  immutable: false,
  maxAge: 0
}));

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
app.use('/member/contracts', contractsRouter);
app.use('/member/bookings', bookingsRouter);
app.use('/member/treatments', treatmentsRouter);
app.use('/api/member', memberRoutes);
app.use('/api', treatmentsRouter);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/contracts', contractsRouter);

// Test Route
app.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'premium-system' });
});



export default app;
