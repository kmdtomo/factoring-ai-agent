#!/bin/bash
echo "Building and starting Mastra..."

# Build
npm run build

# Start server
node --import=./.mastra/output/instrumentation.mjs .mastra/output/index.mjs