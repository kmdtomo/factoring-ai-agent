import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to fix telemetry config
function fixTelemetryConfig() {
  const telemetryPath = path.join(__dirname, '.mastra/output/telemetry-config.mjs');
  
  if (fs.existsSync(telemetryPath)) {
    let content = fs.readFileSync(telemetryPath, 'utf8');
    
    if (content.includes('var mastra$1 = mastra;')) {
      content = content
        .replace(/var mastra\$1 = mastra;\n/, '')
        .replace(/export { mastra\$1 as default, telemetry };/, 'export { telemetry };');
      
      fs.writeFileSync(telemetryPath, content);
      console.log('✅ Fixed telemetry-config.mjs');
    }
  }
}

// Start dev server
console.log('🚀 Starting Mastra dev server...');
const devProcess = spawn('npm', ['run', 'dev'], { 
  stdio: 'inherit',
  shell: true 
});

// Watch for telemetry file and fix it
const watchInterval = setInterval(() => {
  fixTelemetryConfig();
}, 1000);

// Clean up on exit
process.on('SIGINT', () => {
  clearInterval(watchInterval);
  devProcess.kill();
  process.exit();
});