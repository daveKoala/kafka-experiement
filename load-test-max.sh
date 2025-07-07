#!/bin/bash

# Kafka Load Test Script
# Runs the batch API call 1000 times as quickly as possible

URL="localhost:8083/api/send"
CONTENT_TYPE="Content-Type: application/json"
PAYLOAD='[{"topic":"user-events","key":"user-123","value":{"action":"login","timestamp":"2025-06-27T10:30:00Z"},"headers":{"source":"web-app"}},{"topic":"application-metrics","key":"metric-456","value":{"name":"page_view","count":1}}]'

# Number of requests
TOTAL_REQUESTS=100000

# Maximum concurrent requests (adjust based on your system)
MAX_CONCURRENT=50

echo "Starting Kafka load test..."
echo "Total requests: $TOTAL_REQUESTS"
echo "Max concurrent: $MAX_CONCURRENT"
echo "Target URL: $URL"
echo "----------------------------------------"

# Function to make a single request
make_request() {
    local request_num=$1
    curl --silent --location "$URL" \
         --header "$CONTENT_TYPE" \
         --data "$PAYLOAD" \
         --write-out "Request $request_num: %{http_code} - %{time_total}s\n" \
         --output /dev/null
}

# Export function so parallel processes can use it
export -f make_request
export URL CONTENT_TYPE PAYLOAD

# Record start time
start_time=$(date +%s.%N)

# Use GNU parallel if available (much faster)
if command -v parallel &> /dev/null; then
    echo "Using GNU parallel for maximum speed..."
    seq 1 $TOTAL_REQUESTS | parallel -j $MAX_CONCURRENT make_request {}
else
    echo "GNU parallel not found, using background processes..."
    
    # Process in batches for better compatibility
    for batch_start in $(seq 1 $MAX_CONCURRENT $TOTAL_REQUESTS); do
        batch_end=$((batch_start + MAX_CONCURRENT - 1))
        if [ $batch_end -gt $TOTAL_REQUESTS ]; then
            batch_end=$TOTAL_REQUESTS
        fi
        
        echo "Processing batch: $batch_start to $batch_end..."
        
        # Start batch of requests
        for i in $(seq $batch_start $batch_end); do
            make_request $i &
        done
        
        # Wait for this batch to complete before starting next
        wait
        
        echo "Completed: $batch_end/$TOTAL_REQUESTS requests"
    done
fi

# Calculate total time
end_time=$(date +%s.%N)
total_time=$(echo "$end_time - $start_time" | bc)
requests_per_second=$(echo "scale=2; $TOTAL_REQUESTS / $total_time" | bc)

echo "----------------------------------------"
echo "Load test completed!"
echo "Total time: ${total_time}s"
echo "Requests per second: $requests_per_second"
echo "Average time per request: $(echo "scale=4; $total_time / $TOTAL_REQUESTS" | bc)s"