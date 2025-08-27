#!/bin/bash

# Function to fix telemetry config
fix_telemetry() {
    sleep 1  # Wait for file to be generated
    node fix-telemetry.js
}

# Start the fix_telemetry function in background
(
    while true; do
        if [ -f ".mastra/output/telemetry-config.mjs" ]; then
            if grep -q "var mastra\$1 = mastra;" ".mastra/output/telemetry-config.mjs"; then
                fix_telemetry
            fi
        fi
        sleep 2
    done
) &

# Save the background process PID
FIX_PID=$!

# Function to cleanup on exit
cleanup() {
    kill $FIX_PID 2>/dev/null
    exit
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Run mastra dev
npm run dev