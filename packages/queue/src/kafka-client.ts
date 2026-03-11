import { Kafka } from '@upstash/kafka';

let kafkaInstance: Kafka | null = null;

/** Get or create the Upstash Kafka client */
export function getKafkaClient(): Kafka {
  if (!kafkaInstance) {
    const url = process.env['UPSTASH_KAFKA_REST_URL'];
    const username = process.env['UPSTASH_KAFKA_REST_USERNAME'];
    const password = process.env['UPSTASH_KAFKA_REST_PASSWORD'];

    if (!url || !username || !password) {
      throw new Error('Upstash Kafka credentials not configured. Set UPSTASH_KAFKA_REST_URL, UPSTASH_KAFKA_REST_USERNAME, UPSTASH_KAFKA_REST_PASSWORD.');
    }

    kafkaInstance = new Kafka({ url, username, password });
  }
  return kafkaInstance;
}

/** Produce a message to a Kafka topic */
export async function publishToKafka<T extends Record<string, unknown>>(
  topic: string,
  message: T,
  key?: string,
): Promise<void> {
  const kafka = getKafkaClient();
  const producer = kafka.producer();
  await producer.produce(topic, JSON.stringify(message), {
    key: key ?? undefined,
  });
}

/** Consume messages from a Kafka topic */
export async function consumeFromKafka<T>(
  topic: string,
  groupId: string,
  instanceId: string,
): Promise<Array<{ key: string | null; value: T; offset: number; timestamp: number }>> {
  const kafka = getKafkaClient();
  const consumer = kafka.consumer();

  const messages = await consumer.consume({
    consumerGroupId: groupId,
    instanceId,
    topics: [topic],
    autoOffsetReset: 'earliest',
  });

  return messages.map(msg => ({
    key: msg.key as string | null,
    value: JSON.parse(msg.value as string) as T,
    offset: msg.offset,
    timestamp: msg.timestamp,
  }));
}

/** Create a Kafka topic (Upstash REST API) */
export async function createKafkaTopic(
  topicName: string,
  partitions = 1,
  retentionMs = 604800000, // 7 days
): Promise<void> {
  const url = process.env['UPSTASH_KAFKA_REST_URL'];
  const username = process.env['UPSTASH_KAFKA_REST_USERNAME'];
  const password = process.env['UPSTASH_KAFKA_REST_PASSWORD'];

  if (!url || !username || !password) {
    throw new Error('Upstash Kafka credentials not configured');
  }

  const response = await fetch(`${url}/topic`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: topicName,
      partitions,
      retention_time: retentionMs,
    }),
  });

  if (!response.ok && response.status !== 409) { // 409 = topic already exists
    const body = await response.text();
    throw new Error(`Failed to create Kafka topic ${topicName}: ${response.status} ${body}`);
  }
}
