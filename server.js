import { assertRuntimeEnv, env } from './src/config/env.js';

assertRuntimeEnv();

const { default: app } = await import('./app.js');

app.listen(env.port, () => {
  console.log(`Server läuft auf Port ${env.port}`);
});
