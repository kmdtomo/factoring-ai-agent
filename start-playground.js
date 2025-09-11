import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Fix telemetry file continuously
const fixTelemetry = () => {
  const telemetryPath = '.mastra/output/telemetry-config.mjs';
  if (fs.existsSync(telemetryPath)) {
    const fixedContent = `const telemetry = {
  enabled: false
};

export { telemetry };`;
    fs.writeFileSync(telemetryPath, fixedContent);
  }
};

// Start dev server
const devProcess = exec('npm run dev', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(stdout);
});

devProcess.stdout.on('data', (data) => {
  console.log(data.toString());
  // Fix telemetry whenever we see output
  fixTelemetry();
});

devProcess.stderr.on('data', (data) => {
  console.error(data.toString());
  // Also fix on errors
  fixTelemetry();
});

// Fix telemetry every second
setInterval(fixTelemetry, 1000);

console.log('Starting Mastra dev server with telemetry fix...');