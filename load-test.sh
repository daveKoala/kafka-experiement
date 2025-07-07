#!/bin/bash

# Realistic User Behavior Simulation for Kafka
# Generates 100,000 events across 100 users with different usage patterns

# Configuration
TOTAL_EVENTS=100000
ENDPOINT="localhost:8083/api/send"
BATCH_SIZE=10
MAX_CONCURRENT=20

# User distribution
HEAVY_USERS=10    # Users 1-10: 60% of all events
MEDIUM_USERS=30   # Users 11-40: 30% of all events  
LOW_USERS=60      # Users 41-100: 10% of all events

# Calculate events per group
HEAVY_EVENTS=$((TOTAL_EVENTS * 60 / 100))
MEDIUM_EVENTS=$((TOTAL_EVENTS * 30 / 100))
LOW_EVENTS=$((TOTAL_EVENTS * 10 / 100))

# Events per user in each group
HEAVY_PER_USER=$((HEAVY_EVENTS / HEAVY_USERS))
MEDIUM_PER_USER=$((MEDIUM_EVENTS / MEDIUM_USERS))
LOW_PER_USER=$((LOW_EVENTS / LOW_USERS))

echo "🚀 Starting Kafka event simulation..."
echo "📊 Distribution:"
echo "   Heavy users (1-10): $HEAVY_PER_USER events each = $HEAVY_EVENTS total"
echo "   Medium users (11-40): $MEDIUM_PER_USER events each = $MEDIUM_EVENTS total" 
echo "   Low users (41-100): $LOW_PER_USER events each = $LOW_EVENTS total"
echo ""

# Function to generate random timestamp within last 24 hours
generate_timestamp() {
    local now=$(date +%s)
    local random_offset=$((RANDOM % 86400)) # Random seconds in last 24h
    local event_time=$((now - random_offset))
    
    # macOS compatible date formatting
    if [[ "$OSTYPE" == "darwin"* ]]; then
        date -r "$event_time" -u +"%Y-%m-%dT%H:%M:%SZ"
    else
        # Linux date command
        date -d "@$event_time" -Iseconds
    fi
}

# Function to generate user session events
generate_user_session() {
    local user_id=$1
    local session_events=$2
    local user_type=$3
    
    local events_json=""
    local session_id="session_${user_id}_$(date +%s)_${RANDOM}"
    
    # Login event
    local login_time=$(generate_timestamp)
    events_json+="{\"topic\":\"user-events\",\"key\":\"user-$user_id\",\"value\":{\"userId\":\"user-$user_id\",\"sessionId\":\"$session_id\",\"action\":\"login\",\"timestamp\":\"$login_time\",\"userType\":\"$user_type\"},\"headers\":{\"source\":\"web-app\",\"eventType\":\"auth\"}},"
    
    # Activity events (button presses, page views)
    for ((i=1; i<session_events-1; i++)); do
        local action=""
        local topic="user-events"
        local event_type="interaction"
        
        # Different behavior patterns based on user type
        case $user_type in
            "heavy")
                # Heavy users: more button presses, complex interactions
                local rand=$((RANDOM % 100))
                if [ $rand -lt 40 ]; then
                    action="button_A_click"
                elif [ $rand -lt 70 ]; then
                    action="button_B_click" 
                elif [ $rand -lt 85 ]; then
                    action="both_buttons_click"
                elif [ $rand -lt 95 ]; then
                    action="page_view"
                    topic="analytics-events"
                    event_type="analytics"
                else
                    action="feature_usage"
                    topic="feature-events"
                    event_type="feature"
                fi
                ;;
            "medium")
                # Medium users: balanced activity
                local rand=$((RANDOM % 100))
                if [ $rand -lt 30 ]; then
                    action="button_A_click"
                elif [ $rand -lt 55 ]; then
                    action="button_B_click"
                elif [ $rand -lt 70 ]; then
                    action="page_view"
                    topic="analytics-events"
                    event_type="analytics"
                elif [ $rand -lt 85 ]; then
                    action="idle"
                else
                    action="both_buttons_click"
                fi
                ;;
            "low")
                # Low users: minimal activity, mostly page views
                local rand=$((RANDOM % 100))
                if [ $rand -lt 20 ]; then
                    action="button_A_click"
                elif [ $rand -lt 35 ]; then
                    action="button_B_click"
                elif [ $rand -lt 80 ]; then
                    action="page_view"
                    topic="analytics-events"
                    event_type="analytics"
                else
                    action="idle"
                fi
                ;;
        esac
        
        local event_time=$(generate_timestamp)
        events_json+="{\"topic\":\"$topic\",\"key\":\"user-$user_id\",\"value\":{\"userId\":\"user-$user_id\",\"sessionId\":\"$session_id\",\"action\":\"$action\",\"timestamp\":\"$event_time\",\"userType\":\"$user_type\"},\"headers\":{\"source\":\"web-app\",\"eventType\":\"$event_type\"}},"
    done
    
    # Logout event
    local logout_time=$(generate_timestamp)
    events_json+="{\"topic\":\"user-events\",\"key\":\"user-$user_id\",\"value\":{\"userId\":\"user-$user_id\",\"sessionId\":\"$session_id\",\"action\":\"logout\",\"timestamp\":\"$logout_time\",\"userType\":\"$user_type\"},\"headers\":{\"source\":\"web-app\",\"eventType\":\"auth\"}}"
    
    echo "[$events_json]"
}

# Function to send batch to Kafka
send_batch() {
    local batch_data=$1
    curl --silent --location "$ENDPOINT" \
         --header 'Content-Type: application/json' \
         --data "$batch_data" > /dev/null 2>&1 &
}

# Function to show progress bar
show_progress() {
    local current=$1
    local total=$2
    local user_type=$3
    local width=50
    
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r🎯 %s Users: [" "$user_type"
    printf "%*s" $filled | tr ' ' '█'
    printf "%*s" $empty | tr ' ' '░'
    printf "] %d/%d (%d%%) events sent" "$current" "$total" "$percentage"
}

# Track progress
total_sent=0
concurrent_jobs=0

echo "🔥 Generating events for HEAVY users (1-$HEAVY_USERS)..."
    for user_id in $(seq 1 $HEAVY_USERS); do
    # Heavy users have multiple sessions
    sessions_per_user=$((HEAVY_PER_USER / 25 + 1)) # Avg 25 events per session
    events_remaining=$HEAVY_PER_USER
    
    for session in $(seq 1 $sessions_per_user); do
        if [ $events_remaining -le 0 ]; then break; fi
        
        events_this_session=$((RANDOM % 30 + 15)) # 15-45 events per session
        if [ $events_this_session -gt $events_remaining ]; then
            events_this_session=$events_remaining
        fi
        
        # Ensure minimum session size to see button activity
        if [ $events_this_session -lt 5 ]; then
            events_this_session=5
        fi
        
        batch_data=$(generate_user_session $user_id $events_this_session "heavy")
        send_batch "$batch_data"
        
        total_sent=$((total_sent + events_this_session))
        events_remaining=$((events_remaining - events_this_session))
        concurrent_jobs=$((concurrent_jobs + 1))
        
        # Manage concurrency
        if [ $concurrent_jobs -ge $MAX_CONCURRENT ]; then
            wait
            concurrent_jobs=0
            echo "   Heavy users progress: $total_sent events sent..."
        fi
    done
done

echo "📊 Generating events for MEDIUM users (11-40)..."
medium_progress=0
for user_id in $(seq 11 40); do
    # Medium users have fewer, shorter sessions
    sessions_per_user=$((MEDIUM_PER_USER / 15 + 1)) # Avg 15 events per session
    events_remaining=$MEDIUM_PER_USER
    
    for session in $(seq 1 $sessions_per_user); do
        if [ $events_remaining -le 0 ]; then break; fi
        
        events_this_session=$((RANDOM % 15 + 8)) # 8-23 events per session
        if [ $events_this_session -gt $events_remaining ]; then
            events_this_session=$events_remaining
        fi
        
        # Ensure minimum session size to see button activity
        if [ $events_this_session -lt 5 ]; then
            events_this_session=5
        fi
        
        batch_data=$(generate_user_session $user_id $events_this_session "medium")
        send_batch "$batch_data"
        
        medium_progress=$((medium_progress + events_this_session))
        events_remaining=$((events_remaining - events_this_session))
        concurrent_jobs=$((concurrent_jobs + 1))
        
        # Show progress
        show_progress $medium_progress $MEDIUM_EVENTS "MEDIUM"
        
        # Manage concurrency
        if [ $concurrent_jobs -ge $MAX_CONCURRENT ]; then
            wait
            concurrent_jobs=0
        fi
    done
done
echo ""  # New line after progress bar

echo "📉 Generating events for LOW usage users (41-100)..."
low_progress=0
for user_id in $(seq 41 100); do
    # Low users have very few, short sessions
    sessions_per_user=$((LOW_PER_USER / 8 + 1)) # Avg 8 events per session
    events_remaining=$LOW_PER_USER
    
    for session in $(seq 1 $sessions_per_user); do
        if [ $events_remaining -le 0 ]; then break; fi
        
        events_this_session=$((RANDOM % 8 + 4)) # 4-12 events per session
        if [ $events_this_session -gt $events_remaining ]; then
            events_this_session=$events_remaining
        fi
        
        # Ensure minimum session size to see some activity
        if [ $events_this_session -lt 3 ]; then
            events_this_session=3
        fi
        
        batch_data=$(generate_user_session $user_id $events_this_session "low")
        send_batch "$batch_data"
        
        low_progress=$((low_progress + events_this_session))
        events_remaining=$((events_remaining - events_this_session))
        concurrent_jobs=$((concurrent_jobs + 1))
        
        # Show progress
        show_progress $low_progress $LOW_EVENTS "LOW"
        
        # Manage concurrency
        if [ $concurrent_jobs -ge $MAX_CONCURRENT ]; then
            wait
            concurrent_jobs=0
        fi
    done
done
echo ""  # New line after progress bar

# Wait for all remaining requests
wait

# Calculate final totals
final_total=$((heavy_progress + medium_progress + low_progress))

echo ""
echo "✅ Event generation complete!"
echo "📈 Final Results:"
echo "   🔥 Heavy users:  $heavy_progress events"
echo "   📊 Medium users: $medium_progress events" 
echo "   📉 Low users:    $low_progress events"
echo "   🎯 Total sent:   $final_total events"
echo ""
echo "🎯 Suggested Kafka topics to check:"
echo "   • user-events (login/logout/interactions)"
echo "   • analytics-events (page views, tracking)"
echo "   • feature-events (advanced feature usage)"
echo ""
echo "🔍 Check your Kafka UI at http://localhost:8080/"