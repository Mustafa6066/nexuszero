import { Kafka, logLevel } from 'kafkajs';

let kafkaInstance: Kafka | null = null;

function getKafkaInstance(): Kafka {
  if (!kafkaInstance) {
    const brokers = process.env['CONFLUENT_BOOTSTRAP_SERVERS'];
    const apiKey = process.env['CONFLUENT_API_KEY'];
    const apiSecret = process.env['CONFLUENT_API_SECRET'];

    if (!brokers || !apiKey || !apiSecret) {
      throw new Error(
        'Confluent Kafka credentials not configured. Set CONFLUENT_BOOTSTRAP_SERVERS, CONFLUENT_API_KEY, CONFLUENT_API_SECRET.',
      );
    }

    kafkaInstance = new Kafka({
      clientId: 'nexuszero',
      brokers: brokers.split(',').map(b => b.trim()),
      ssl: true,
      sasl: {
        mechanism: 'plain',
        username: apiKey,
        password: apiSecret,
      },
      logLevel: logLevel.ERROR,
    });
  }
  return kafkaInstance;
}

/** Produce a message to a Kafka topic */
export async function publishToKafka<T extends Record<string, unknown>>(
  topic: string,
  message: T,
  key?: string,
): Promise<void> {
  const kafka = getKafkaInstance();
  const producer = kafka.producer();
  await producer.connect();
  try {
    await producer.send({
      topic,
      messages: [{ key: key ?? null, value: JSON.stringify(message) }],
    });
  } finally {
    await producer.disconnect();
  }
}

/** Consume a batch of messages from a Kafka topic (poll once and return) */
export async function consumeFromKafka<T>(
  topic: string,
  groupId: string,
  _instanceId: string,
): Promise<Array<{ key: string | null; value: T; offset: number; timestamp: number }>> {
  const kafka = getKafkaInstance();
  const consumer = kafka.consumer({ groupId });
  const results: Array<{ key: string | null; value: T; offset: number; timestamp: number }> = [];

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await new Promise<void>((resolve) => {
    // Collect messages for up to 2 seconds then resolve
    const timeout = setTimeout(() => resolve(), 2000);

    consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        results.push({
          key: message.key ? message.key.toString() : null,
          value: JSON.parse(message.value?.toString() ?? '{}') as T,
          offset: parseInt(message.offset, 10),
          timestamp: parseInt(message.timestamp, 10),
        });
        // If we got at least one batch, resolve sooner
        clearTimeout(timeout);
        setTimeout(() => resolve(), 100);
      },
    }).catch((err) => {
      console.error('Kafka consumer.run() failed:', err instanceof Error ? err.message : String(err));
      resolve();
    });
  });

  await consumer.disconnect();
  return results;
}

/** Create a Kafka topic via KafkaJS admin */
export async function createKafkaTopic(
  topicName: string,
  partitions = 1,
  retentionMs = 604800000, // 7 days
): Promise<void> {
  const kafka = getKafkaInstance();
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [{
        topic: topicName,
        numPartitions: partitions,
        configEntries: [{ name: 'retention.ms', value: String(retentionMs) }],
      }],
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
}
