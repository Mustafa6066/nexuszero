import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
  type SpanOptions,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';

export type TraceCarrier = Record<string, string>;

export interface OpenTelemetryInitOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
}

export interface SpanExecutionOptions {
  tracerName?: string;
  attributes?: Attributes;
  parentContext?: Context;
  kind?: SpanKind;
}

let sdkStartPromise: Promise<void> | null = null;
let sdkInstance: NodeSDK | null = null;

function resolveTraceEndpoint(): string | null {
  const explicit = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;
  if (!explicit) {
    return null;
  }

  if (explicit.endsWith('/v1/traces')) {
    return explicit;
  }

  return `${explicit.replace(/\/$/, '')}/v1/traces`;
}

function isTracingEnabled(): boolean {
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    return false;
  }

  return Boolean(resolveTraceEndpoint());
}

export async function initializeOpenTelemetry(options: OpenTelemetryInitOptions): Promise<void> {
  if (!isTracingEnabled()) {
    return;
  }

  if (sdkStartPromise) {
    return sdkStartPromise;
  }

  const exporter = new OTLPTraceExporter({ url: resolveTraceEndpoint()! });

  sdkInstance = new NodeSDK({
    traceExporter: exporter,
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      'service.version': options.serviceVersion ?? '0.1.0',
      'deployment.environment.name': options.environment ?? process.env.NODE_ENV ?? 'development',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdkStartPromise = Promise.resolve(sdkInstance.start());
  await sdkStartPromise;

  const shutdown = async () => {
    if (!sdkInstance) {
      return;
    }

    await sdkInstance.shutdown().catch(() => undefined);
    sdkInstance = null;
    sdkStartPromise = null;
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('SIGINT', () => {
    void shutdown();
  });
}

export async function withSpan<T>(
  name: string,
  options: SpanExecutionOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(options.tracerName ?? 'nexuszero');
  const spanOptions: SpanOptions = {
    attributes: options.attributes,
    kind: options.kind ?? SpanKind.INTERNAL,
  };

  const parentContext = options.parentContext ?? context.active();

  return tracer.startActiveSpan(name, spanOptions, parentContext, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.recordException(error instanceof Error ? error : new Error(message));
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function injectTraceContext(ctx: Context = context.active()): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(ctx, carrier);
  return carrier;
}

export function extractTraceContext(carrier?: TraceCarrier | null): Context {
  if (!carrier) {
    return context.active();
  }

  return propagation.extract(context.active(), carrier);
}

export function withExtractedContext<T>(carrier: TraceCarrier | null | undefined, fn: () => T): T {
  return context.with(extractTraceContext(carrier), fn);
}

export function spanKindForMessagingProducer(): SpanKind {
  return SpanKind.PRODUCER;
}

export function spanKindForMessagingConsumer(): SpanKind {
  return SpanKind.CONSUMER;
}

export function spanKindForServer(): SpanKind {
  return SpanKind.SERVER;
}