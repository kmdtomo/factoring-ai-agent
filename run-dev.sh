#!/bin/bash

# Start dev server and fix telemetry in background
npm run dev &

# Wait for file to be created
sleep 2

# Fix telemetry file
if [ -f ".mastra/output/telemetry-config.mjs" ]; then
  node fix-telemetry.js
fi

# Keep script running
wait