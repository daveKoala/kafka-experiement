#!/bin/bash

# Simple version - just hammer the endpoint 1000 times
for i in {1..10000}; do
    curl --silent --location 'localhost:8081/api/batch' \
         --header 'Content-Type: application/json' \
         --data '[{"topic":"user-events","key":"user-123","value":{"whoAreYou":"I`m Batman","action":"login","timestamp":"2025-06-27T10:30:00Z"},"headers":{"source":"web-app"}},{"topic":"application-metrics","key":"metric-456","value":{"name":"page_view","count":1}}]' &
    
    # Limit concurrent connections to avoid overwhelming the server
    if [ $((i % 50)) -eq 0 ]; then
        wait  # Wait for current batch to complete
        echo "Completed $i requests..."
    fi
done

wait  # Wait for any remaining requests
echo "All 1000 requests completed!"