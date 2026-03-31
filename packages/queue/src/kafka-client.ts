import { Kafka, logLevel } from 'kafkajs';
import {
  extractTraceContext,
  injectTraceContext,
  retry,
  spanKindForMessagingConsumer,
  spanKindForMessagingProducer,
  withSpan,
  type TraceCarrier,
} from '@nexuszero/shared';

let kafkaInstance: Kafka | null = null;

type ProducerLike = ReturnType<Kafka['producer']>;
type ConsumerLike = ReturnType<Kafka['consumer']>;
type AdminLike = ReturnType<Kafka['admin']>;

interface KafkaLike {
  producer: Kafka['producer'];
  consumer: Kafka['consumer'];
  admin: Kafka['admin'];
}

export interface PublishKafkaOptions {
  headers?: Record<string, string>;
  kafka?: KafkaLike;
}

export interface ConsumedKafkaMessage<T> {
  key: string | null;
  value: T;
  offset: number;
  timestamp: number;
  headers: Record<string, string>;
  traceContext: TraceCarrier | null;
}

// ---------------------------------------------------------------------------
// Singleton producer — reused across all publishToKafka calls
// ---------------------------------------------------------------------------

let singletonProducer: ProducerLike | null = null;
let producerConnectPromise: Promise<void> | null = null;

async function getSingletonProducer(kafka?: KafkaLike): Promise<ProducerLike> {
  const client = kafka ?? getKafkaInstance();
  if (!singletonProducer) {
    singletonProducer = client.producer({
      allowAutoTopicCreation: false,
      retry: { retries: 5 },
    });
    producerConnectPromise = singletonProducer.connect();
  }
  await producerConnectPromise;
  return singletonProducer;
}

// ---------------------------------------------------------------------------
// Long-lived consumer registry — reuse consumers across poll calls
// ---------------------------------------------------------------------------

interface ManagedConsumer {
  consumer: ConsumerLike;
  buffer: Array<ConsumedKafkaMessage<unknown>>;
  running: boolean;
}

const consumerRegistry = new Map<string, ManagedConsumer>();

function getKafkaClient(kafka?: KafkaLike): KafkaLike {
  return kafka ?? getKafkaInstance();
}

function decodeHeaders(headers?: Record<string, Buffer | string | undefined>): Record<string, string> {
  const decoded: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') {
      decoded[key] = value;
      continue;
    }

    if (value) {
      decoded[key] = value.toString();
    }
  }

  return decoded;
}

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

/** Produce a message to a Kafka topic (uses singleton producer) */
export async function publishToKafka<T extends Record<string, unknown>>(
  topic: string,
  message: T,
  key?: string,
  options: PublishKafkaOptions = {},
): Promise<void> {
  const headers = { ...injectTraceContext(), ...(options.headers ?? {}) };

  await withSpan('kafka.publish', {
    tracerName: 'nexuszero.queue',
    kind: spanKindForMessagingProducer(),
    attributes: {
      'messaging.system': 'kafka',
      'messaging.destination.name': topic,
      'messaging.kafka.message.key': key ?? '',
    },
  }, async () => {
    const producer = await getSingletonProducer(options.kafka);
    await retry(async () => {
      await producer.send({
        topic,
        messages: [{ key: key ?? null, value: JSON.stringify(message), headers }],
      });
    }, {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 5_000,
    });
  });
}

/**
 * Consume a batch of messages from a Kafka topic.
 *
 * Uses a long-lived consumer per topic+groupId combination.
 * On first call it creates and subscribes the consumer; subsequent calls drain
 * the internal buffer that the consumer populates in the background.
 */
export async function consumeFromKafka<T>(
  topic: string,
  groupId: string,
  _instanceId: string,
  options: { kafka?: KafkaLike } = {},
): Promise<Array<ConsumedKafkaMessage<T>>> {
  const registryKey = `${topic}:${groupId}`;
  let managed = consumerRegistry.get(registryKey);

  if (!managed) {
    const kafka = getKafkaClient(options.kafka);
    const consumer = kafka.consumer({ groupId });

    managed = { consumer, buffer: [], running: false };
    consumerRegistry.set(registryKey, managed);

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    const managedRef = managed;

    await consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        const headers = decodeHeaders(message.headers as Record<string, Buffer | string | undefined> | undefined);
        managedRef.buffer.push({
          key: message.key ? message.key.toString() : null,
          value: JSON.parse(message.value?.toString() ?? '{}') as unknown,
          offset: parseInt(message.offset, 10),
          timestamp: parseInt(message.timestamp, 10),
          headers,
          traceContext: Object.keys(headers).length > 0 ? headers : null,
        });
      },
    });

    managed.running = true;

    // Give the consumer a moment to fetch initial messages
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  // Drain and return buffered messages
  const messages = managed.buffer.splice(0) as Array<ConsumedKafkaMessage<T>>;
  return messages;
}

/** Create a Kafka topic via KafkaJS admin */
export async function createKafkaTopic(
  topicName: string,
  partitions = 1,
  retentionMs = 604800000, // 7 days
  options: { kafka?: KafkaLike } = {},
): Promise<void> {
  const kafka = getKafkaClient(options.kafka);
  const admin = kafka.admin();
  await withSpan('kafka.topic.create', {
    tracerName: 'nexuszero.queue',
    kind: spanKindForMessagingProducer(),
    attributes: {
      'messaging.system': 'kafka',
      'messaging.destination.name': topicName,
    },
  }, async () => {
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
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown — close all long-lived connections
// ---------------------------------------------------------------------------

/** Disconnect all Kafka producers and consumers. Call on process shutdown. */
export async function closeKafkaConnections(): Promise<void> {
  const shutdowns: Promise<void>[] = [];

  if (singletonProducer) {
    shutdowns.push(singletonProducer.disconnect().catch(() => undefined));
    singletonProducer = null;
    producerConnectPromise = null;
  }

  for (const [key, managed] of consumerRegistry) {
    shutdowns.push(managed.consumer.disconnect().catch(() => undefined));
    consumerRegistry.delete(key);
  }

  await Promise.allSettled(shutdowns);
}
