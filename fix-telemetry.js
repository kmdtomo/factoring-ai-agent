#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix telemetry-config.mjs file
const telemetryConfigPath = path.join(__dirname, '.mastra/output/telemetry-config.mjs');

if (fs.existsSync(telemetryConfigPath)) {
  const content = fs.readFileSync(telemetryConfigPath, 'utf8');
  
  // Remove the problematic mastra reference and default export
  const fixedContent = content
    .replace(/var mastra\$1 = mastra;\n/, '')
    .replace(/export { mastra\$1 as default, telemetry };/, 'export { telemetry };');
  
  fs.writeFileSync(telemetryConfigPath, fixedContent);
  console.log('Fixed telemetry-config.mjs');
}