import { assertRuntimeEnv, env } from './src/config/env.js';
import {
  ensureContractActionSchema,
  ensureContractActionRateLimitSchema,
  ensureMemberMonthlyUsageImportSchema,
  ensurePremiumAdminSchema
} from './src/services/schema.service.js';

assertRuntimeEnv();
await ensureContractActionSchema();
await ensureContractActionRateLimitSchema();
await ensureMemberMonthlyUsageImportSchema();
await ensurePremiumAdminSchema();

const { default: app } = await import('./app.js');

app.listen(env.port, () => {
  console.log(`Server läuft auf Port ${env.port}`);
});
