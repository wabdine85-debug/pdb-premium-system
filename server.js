import app from './app.js';
import { env } from './src/config/env.js';

app.listen(env.port, () => {
  console.log(`Server läuft auf Port ${env.port}`);
});