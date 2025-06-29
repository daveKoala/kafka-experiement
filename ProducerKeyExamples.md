# Kafka Topic Partitions

Kafka Partitioning: The Full Picture
Basic Flow

```:bash
Topic: user-events
├── Partition 0: [msg1, msg4, msg7, ...]
├── Partition 1: [msg2, msg5, msg8, ...]
└── Partition 2: [msg3, msg6, msg9, ...]
```

Consumers subscribe to topic "user-events" → Read from ALL partitions

### The Problem: Message Distribution Within Topic

**Scenario: User Activity Tracking**

These messages are related (same user)

```:javascript
producer.send({ topic: 'user-events', messages: [
  { value: '{"userId": "123", "action": "login"}' },
  { value: '{"userId": "123", "action": "view_page"}' },
  { value: '{"userId": "123", "action": "logout"}' }
]});
```

Without Message Keys (Random Distribution):

```:bash
Partition 0: login (user-123)
Partition 1: view_page (user-123)  ← Different partition!
Partition 2: logout (user-123)     ← Different partition!

```

**Problem: Related messages scattered across partitions!**

With Message Keys (Consistent Distribution):

Use userId as key

```:bash
producer.send({ topic: 'user-events', messages: [
  { key: '123', value: '{"userId": "123", "action": "login"}' },
  { key: '123', value: '{"userId": "123", "action": "view_page"}' },
  { key: '123', value: '{"userId": "123", "action": "logout"}' }
]});

```

Result:

```:bash
Partition 0: [empty]
Partition 1: login → view_page → logout (all user-123)  ← Same partition!
Partition 2: [empty]

```

Why This Matters for Consumers

Consumer Processing Related Messages

```:bash
consumer.run({
  eachMessage: async ({ message, partition }) => {
    const event = JSON.parse(message.value);

    if (event.action === 'login') {
      // Start session tracking
      sessions[event.userId] = { startTime: Date.now() };
    }

    if (event.action === 'logout') {
      // Calculate session duration
      const session = sessions[event.userId];  // ← Might not exist!
      if (session) {
        console.log(`Session duration: ${Date.now() - session.startTime}ms`);
      }
    }
  }
});
```

## With Random Partitioning:

Consumer 1 gets "login" event
Consumer 2 gets "logout" event
Result: Consumer 2 can't find the session! 💥

## With Key-Based Partitioning:

Same consumer gets ALL events for user-123
Result: Perfect session tracking! ✅

## Example partition keys

```:bash
// 1. USER-BASED GROUPING
// All events for a user stay together
producer.send({
topic: 'user-events',
messages: [{
key: 'user-123', // ← User ID as key
value: JSON.stringify({ action: 'login', timestamp: Date.now() })
}]
});

// 2. ORDER-BASED GROUPING
// Order lifecycle events stay in sequence
producer.send({
topic: 'order-events',
messages: [{
key: 'order-789', // ← Order ID as key
value: JSON.stringify({ status: 'created', total: 99.99 })
}]
});

// 3. DEVICE/SENSOR GROUPING
// IoT sensor readings from same device
producer.send({
topic: 'sensor-data',
messages: [{
key: 'device-sensor-001', // ← Device ID as key
value: JSON.stringify({ temperature: 23.5, humidity: 65 })
}]
});

// 4. GEOGRAPHIC GROUPING
// Events from same region/location
producer.send({
topic: 'location-events',
messages: [{
key: 'region-eu-west', // ← Region as key
value: JSON.stringify({ event: 'server-restart', datacenter: 'dublin' })
}]
});

// 5. SESSION-BASED GROUPING
// All activity in a user session
producer.send({
topic: 'session-events',
messages: [{
key: 'session-xyz789', // ← Session ID as key
value: JSON.stringify({ action: 'page_view', page: '/dashboard' })
}]
});

// 6. TENANT/CUSTOMER GROUPING (Multi-tenant apps)
// All events for a specific customer/organization
producer.send({
topic: 'tenant-events',
messages: [{
key: 'tenant-acme-corp', // ← Tenant/Customer ID as key
value: JSON.stringify({ event: 'user_created', userId: 'john.doe' })
}]
});

// 7. CONVERSATION/THREAD GROUPING
// Chat messages or forum posts in same conversation
producer.send({
topic: 'messages',
messages: [{
key: 'conversation-456', // ← Conversation ID as key
value: JSON.stringify({ user: 'alice', message: 'Hello everyone!' })
}]
});

// 8. COMPOSITE KEYS (Multiple identifiers)
// When you need multiple logical groupings
producer.send({
topic: 'user-metrics',
messages: [{
key: 'user-123:daily', // ← User + time period
value: JSON.stringify({ metric: 'page_views', count: 42, date: '2025-06-27' })
}]
});

// 9. NO KEY (Random distribution)
// When you don't need ordering/grouping
producer.send({
topic: 'system-logs',
messages: [{
// key: undefined, ← No key = random partition
value: JSON.stringify({ level: 'info', message: 'Server started' })
}]
});

// 10. TIMESTAMP-BASED GROUPING
// Group by time windows (hourly batches, etc.)
const hourKey = new Date().toISOString().slice(0, 13); // "2025-06-27T08"
producer.send({
topic: 'hourly-metrics',
messages: [{
key: hourKey, // ← Time window as key
value: JSON.stringify({ metric: 'requests_per_hour', count: 1500 })
}]
});

```
