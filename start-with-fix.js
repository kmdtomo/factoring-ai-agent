#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';

// Fix telemetry file
const fixTelemetry = () => {
  const telemetryPath = '.mastra/output/telemetry-config.mjs';
  if (fs.existsSync(telemetryPath)) {
    const fixedContent = `const telemetry = {
  enabled: false
};

export { telemetry };`;
    fs.writeFileSync(telemetryPath, fixedContent);
    console.log('Fixed telemetry-config.mjs');
  }
};

// Fix immediately before starting
fixTelemetry();

// Start the server
const serverProcess = spawn('node', ['--import=./.mastra/output/instrumentation.mjs', '.mastra/output/index.mjs'], {
  stdio: 'inherit'
});

serverProcess.on('exit', (code) => {
  process.exit(code);
});
