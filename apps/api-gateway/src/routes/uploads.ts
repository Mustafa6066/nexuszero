import { Hono } from 'hono';
import { withTenantDb, assistantAttachments } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = new Hono();

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });
}

// POST /uploads/presign — get presigned upload URL
app.post('/presign', async (c) => {
  const tenantId = c.get('tenantId');
  const { fileName, mimeType, sessionId } = await c.req.json();

  if (!fileName || !mimeType || !sessionId) {
    throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'fileName, mimeType, sessionId are required', 400);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError(ERROR_CODES.VALIDATION.INVALID_VALUE, `Unsupported file type: ${mimeType}`, 400);
  }

  const bucket = process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? 'nexuszero-uploads';
  const storageKey = `uploads/${tenantId}/${sessionId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const s3 = getS3Client();
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: mimeType }),
    { expiresIn: 300 }, // 5 minutes
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const [attachment] = await withTenantDb(tenantId, async (db) =>
    db.insert(assistantAttachments).values({
      tenantId,
      sessionId,
      fileName,
      mimeType,
      sizeBytes: 0, // updated after upload
      storageKey,
      status: 'pending',
      expiresAt,
    }).returning({ id: assistantAttachments.id, storageKey: assistantAttachments.storageKey }),
  );

  return c.json({ uploadUrl, attachmentId: attachment.id, storageKey: attachment.storageKey });
});

// POST /uploads/:id/parse — trigger parsing after upload
app.post('/:id/parse', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [attachment] = await withTenantDb(tenantId, async (db) =>
    db.select().from(assistantAttachments)
      .where(and(eq(assistantAttachments.tenantId, tenantId), eq(assistantAttachments.id, id)))
      .limit(1),
  );

  if (!attachment) throw new AppError(ERROR_CODES.NOT_FOUND, 'Attachment not found', 404);

  // Parse in background (non-blocking response)
  parseAttachment(tenantId, id, attachment.storageKey, attachment.mimeType, attachment.fileName).catch(err => {
    console.error(`[uploads] Parse failed for ${id}:`, err);
  });

  return c.json({ parsing: true, attachmentId: id });
});

// GET /uploads/:id — get parsed result
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [attachment] = await db.select().from(assistantAttachments)
      .where(and(eq(assistantAttachments.tenantId, tenantId), eq(assistantAttachments.id, id)))
      .limit(1);

    if (!attachment) throw new AppError(ERROR_CODES.NOT_FOUND, 'Attachment not found', 404);
    return c.json(attachment);
  });
});

async function parseAttachment(
  tenantId: string,
  attachmentId: string,
  storageKey: string,
  mimeType: string,
  fileName: string,
): Promise<void> {
  try {
    const bucket = process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? 'nexuszero-uploads';
    const s3 = getS3Client();

    // Download file from S3/R2
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    let parsedText = '';
    let parsedSummary = '';

    if (mimeType === 'application/pdf') {
      const pdfParse = await import('pdf-parse');
      const pdf = await pdfParse.default(buffer);
      parsedText = pdf.text.slice(0, 50000); // limit
      parsedSummary = `PDF: ${pdf.numpages} pages, ${pdf.text.length} chars`;
    } else if (mimeType === 'text/csv' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      const csvParts = sheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]!);
        return `Sheet: ${name}\n${csv}`;
      });
      parsedText = csvParts.join('\n\n').slice(0, 50000);
      parsedSummary = `Spreadsheet: ${sheetNames.length} sheets`;
    } else if (mimeType.startsWith('image/')) {
      parsedText = `[Image: ${fileName}]`;
      parsedSummary = `Image file: ${fileName} (${mimeType})`;
    }

    await withTenantDb(tenantId, async (db) =>
      db.update(assistantAttachments)
        .set({ parsedText, parsedSummary, status: 'parsed' })
        .where(eq(assistantAttachments.id, attachmentId)),
    );
  } catch (err) {
    await withTenantDb(tenantId, async (db) =>
      db.update(assistantAttachments)
        .set({ status: 'failed' })
        .where(eq(assistantAttachments.id, attachmentId)),
    );
    throw err;
  }
}

export { app as uploadRoutes };
