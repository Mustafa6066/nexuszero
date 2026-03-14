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

/** Produce a message to a Kafka topic */
export async function publishToKafka<T extends Record<string, unknown>>(
  topic: string,
  message: T,
  key?: string,
  options: PublishKafkaOptions = {},
): Promise<void> {
  const kafka = getKafkaClient(options.kafka);
  const producer = kafka.producer();
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
    await producer.connect();
    try {
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
    } finally {
      await producer.disconnect();
    }
  });
}

/** Consume a batch of messages from a Kafka topic (poll once and return) */
export async function consumeFromKafka<T>(
  topic: string,
  groupId: string,
  _instanceId: string,
  options: { kafka?: KafkaLike } = {},
): Promise<Array<ConsumedKafkaMessage<T>>> {
  const kafka = getKafkaClient(options.kafka);
  const consumer = kafka.consumer({ groupId });
  const results: Array<ConsumedKafkaMessage<T>> = [];

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await new Promise<void>((resolve) => {
    // Collect messages for up to 2 seconds then resolve
    const timeout = setTimeout(() => resolve(), 2000);

    consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        const headers = decodeHeaders(message.headers as Record<string, Buffer | string | undefined> | undefined);
        results.push({
          key: message.key ? message.key.toString() : null,
          value: JSON.parse(message.value?.toString() ?? '{}') as T,
          offset: parseInt(message.offset, 10),
          timestamp: parseInt(message.timestamp, 10),
          headers,
          traceContext: Object.keys(headers).length > 0 ? headers : null,
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
