#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[fix-telemetry] Starting telemetry fix...');
console.log('[fix-telemetry] Current directory:', __dirname);

// Fix telemetry-config.mjs file
const telemetryConfigPath = path.join(__dirname, '.mastra/output/telemetry-config.mjs');
const instrumentationPath = path.join(__dirname, '.mastra/output/instrumentation.mjs');

// Ensure .mastra/output directory exists
const outputDir = path.join(__dirname, '.mastra/output');
if (!fs.existsSync(outputDir)) {
  console.log('[fix-telemetry] Creating .mastra/output directory...');
  fs.mkdirSync(outputDir, { recursive: true });
}

// Fix telemetry-config.mjs
const fixedTelemetryContent = `// Auto-fixed by fix-telemetry.js
const telemetry = {
  enabled: false,
  serviceName: 'factoring-ai-agent',
  sampling: {
    enabled: false
  }
};

export { telemetry };
`;

fs.writeFileSync(telemetryConfigPath, fixedTelemetryContent);
console.log('[fix-telemetry] ✓ Fixed telemetry-config.mjs');

// Fix instrumentation.mjs if it exists - completely disable it
if (fs.existsSync(instrumentationPath)) {
  // Replace entire file with a no-op version
  const noopInstrumentation = `// Telemetry disabled by fix-telemetry.js
console.log('[Instrumentation] Telemetry is disabled');
`;

  fs.writeFileSync(instrumentationPath, noopInstrumentation);
  console.log('[fix-telemetry] ✓ Disabled instrumentation.mjs (telemetry disabled)');
} else {
  console.log('[fix-telemetry] - instrumentation.mjs not found (will be created on build)');
}

console.log('[fix-telemetry] Done!');