#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix telemetry-config.mjs file
const telemetryConfigPath = path.join(__dirname, '.mastra/output/telemetry-config.mjs');
const instrumentationPath = path.join(__dirname, '.mastra/output/instrumentation.mjs');

if (fs.existsSync(telemetryConfigPath)) {
  const fixedContent = `const telemetry = {
  enabled: false
};

export { telemetry };`;

  fs.writeFileSync(telemetryConfigPath, fixedContent);
  console.log('Fixed telemetry-config.mjs');
}

// Also fix instrumentation.mjs to inline the telemetry config
if (fs.existsSync(instrumentationPath)) {
  let content = fs.readFileSync(instrumentationPath, 'utf8');

  // Replace the import and usage with inline config
  content = content.replace(
    /import \{ telemetry \} from ['"]\.\/telemetry-config\.mjs['"];/,
    'const telemetry = { enabled: false };'
  );

  fs.writeFileSync(instrumentationPath, content);
  console.log('Fixed instrumentation.mjs');
}