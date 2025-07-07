# Kafka Project - Idiots Guide

_This is for stressed developers who need to get up and running quickly._

If you're confused by the README.md doc, this is the step-by-step guide that assumes you know nothing about Kafka.

## What is this project exploring?

This project demonstrates how to use Apache Kafka for real-time message streaming and processing. Think of it as a super-powered messaging system that can handle millions of messages per second, with multiple services listening to and processing those messages independently.

**Real-world use case:** Instead of writing logs directly to files, we send them to Kafka. Multiple consumers can then process these logs differently - one might save to a database, another might send alerts, and a third might generate analytics.

---

## Getting up and running in local developer mode

Copy and rename `./.env_local` to `.env`

### Step 1: Get the Kafka broker(s) and UI containers running

```bash
make dev-infra
```

**Note:** This can take a minute, so be patient. It's downloading and starting Docker containers for Kafka and its dependencies.

Check if everything is running:

```bash
make status
```

You should see containers running for Kafka, Zookeeper, and the Kafka UI.

### Step 2: Start the backend services

In the same terminal tab or open a new one, from the project root:

```bash
npm run dev
```

This starts your Node.js application that will produce and consume messages.

### Step 3: Check the Kafka UI

Open your browser and go to: http://localhost:8080/

This is the Kafka UI where you can see topics, messages, and consumers in action. If this is your first time running the project, you won't see any 'topics' or 'consumers' yet - that's normal!

---

## Understanding Kafka Concepts

### Topics

**What are topics?** Think of topics as different "channels" or "folders" where messages are organized. For example:

- `user-logs` topic for user activity logs
- `error-logs` topic for error messages
- `metrics` topic for performance data

Messages are sorted into topics based on their type or purpose. The same message can be copied to multiple topics if needed.

### Creating Topics

Let's create some topics to work with:

```bash
make create-topics
```

This creates several predefined topics for logging and metrics.

You can see the topics either in the UI (http://localhost:8080/) or via command line:

```bash
make list-topics-dev
```

It might take a minute for the topics to be instantiated

### Messages

**What are messages?** A message is just a JSON object sent to Kafka. There's no fixed structure (though you can add schema validation later).

Example message:

```json
{
  "level": "info",
  "message": "User logged in",
  "timestamp": "2025-06-26T10:30:00Z",
  "userId": "12345"
}
```

### Sending Test Messages

Let's send some sample messages to see Kafka in action:

```bash
make test-produce
```

This sends several test messages to different topics.

**See the messages:** Go to the UI → click on a topic → click "Messages" tab to see what was sent.

### Consumers

**What are consumers?** Consumers are services that "listen" to topics and process messages as they arrive. Think of them as workers that take messages from a queue and do something with them.

When you ran `npm run dev`, a consumer was automatically created and started. What's it doing?

- Streaming messages from topics in real-time
- Processing each message (in our case, writing to files, SQLite or Elastic Search)
- In a real-world scenario, it might validate data and update a database

**Check the consumer in action:** Look at `./logs/combined.log` - you should see the test messages appearing there.

---

## GUI

- KafkaUI: http://localhost:8080/
- Elastic: http://localhost:5601/
- Flink Web UI: http://localhost:8081

---

## Why Use Kafka? (Is this overkill?)

**For small projects:** Yes, this is probably overkill. A simple logging library writing to files is fine.

**For larger systems:** Kafka shines when you have:

- **High volume:** Thousands of log messages per second
- **Real-time processing:** You need to react to events immediately
- **Multiple consumers:** Different teams/services need the same data processed differently
- **Scalability:** Easy to add new consumers without affecting existing ones

### Real-world benefits:

1. **Decoupled systems:** Producers don't need to know about consumers
2. **Fault tolerance:** Messages are stored safely even if consumers are down
3. **Scalability:** Easy to add more consumers or scale existing ones
4. **Flexibility:** New requirements = new consumer, no changes to producers

**Example scenario:** Marketing team wants PowerBI reports from your logs

- **Without Kafka:** You'd need to modify your logging code and add database writes
- **With Kafka:** Just create a new consumer that reads logs and writes to their database

---

## Quick Commands Reference

```bash
# Start Kafka infrastructure
make dev-infra

# Check status
make status

# Start your application
npm run dev

# Create topics
make create-topics

# List topics
make list-topics-dev

# Send test messages
make test-produce

# Stop everything
make down
```

---

## Troubleshooting

**Kafka UI not loading?**

- Check `make status` - all containers should be running
- Wait a minute - Kafka takes time to start up

**No messages appearing?**

- Run `make test-produce` to send test messages
- Check `./logs/combined.log` for processed messages

**Consumer not working?**

- Make sure `npm run dev` is running
- Check the terminal for error messages

---

## Next Steps

Once you're comfortable with the basics:

1. Look at the actual code in `src/` to understand how producers and consumers work
2. Try modifying the consumer to do something different with messages
3. Create your own topics and message types
4. Explore the Kafka UI to understand message flow and consumer groups
