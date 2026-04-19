import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import memberRoutes from './src/routes/member.routes.js';
import treatmentsRouter from "./src/routes/treatments.js";
import bookingsRouter from "./src/routes/bookings.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/member', memberRoutes);
app.use("/api/treatments", treatmentsRouter);
app.use("/api/bookings", bookingsRouter);

// Test Route
app.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'premium-system' });
});

export default app;