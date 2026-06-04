// S3-compatible ObjectStore abstraction (ADR-0003). One driver, configurable
// endpoint + path-style, works with AWS S3, Cloudflare R2, MinIO, Garage.

import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

// Internal client (server-to-storage, in-cluster endpoint).
const internal = new S3Client({
  region: config.storage.region,
  endpoint: config.storage.endpoint,
  forcePathStyle: config.storage.forcePathStyle,
  credentials: {
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
  },
});

// Public client (browser-facing endpoint) used only to sign URLs the browser hits.
const publicClient = new S3Client({
  region: config.storage.region,
  endpoint: config.storage.publicEndpoint,
  forcePathStyle: config.storage.forcePathStyle,
  credentials: {
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
  },
});

const BUCKET = config.storage.bucket;
const TTL = config.storage.presignTtlSeconds;

export async function ensureBucket(): Promise<void> {
  try {
    await internal.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await internal.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`[storage] created bucket ${BUCKET}`);
    } catch (e) {
      console.warn(`[storage] could not ensure bucket ${BUCKET}:`, (e as Error).message);
    }
  }
}

export async function presignPut(key: string): Promise<string> {
  return getSignedUrl(publicClient, new PutObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: TTL,
  });
}

export async function presignGet(key: string): Promise<string> {
  return getSignedUrl(publicClient, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: TTL,
  });
}

export async function createMultipart(key: string): Promise<string> {
  const out = await internal.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!out.UploadId) throw new Error('no UploadId returned');
  return out.UploadId;
}

export async function presignPart(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  return getSignedUrl(
    publicClient,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: TTL },
  );
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  await internal.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await internal.send(
    new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }),
  );
}

export async function head(key: string): Promise<{ size: number } | null> {
  try {
    const out = await internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { size: out.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

export async function del(key: string): Promise<void> {
  await internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ----- Proxy-through-backend transfer -------------------------------------
// All media flows through the API: the browser never talks to storage directly.
// This decouples the frontend from the storage vendor (ADR: server-proxied media).

export async function putObject(
  key: string,
  body: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  await internal.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectStream(
  key: string,
): Promise<{ body: NodeJS.ReadableStream; contentType?: string; contentLength?: number } | null> {
  try {
    const out = await internal.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!out.Body) return null;
    return {
      body: out.Body as unknown as NodeJS.ReadableStream,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
    };
  } catch {
    return null;
  }
}

// Key convention: org/{org}/project/{project}/session/{session}/track/{track}/seg/{seq}.{ext}
export function segmentKey(
  org: string,
  project: string,
  session: string,
  track: string,
  seq: number,
  ext = 'webm',
): string {
  const padded = String(seq).padStart(8, '0');
  return `org/${org}/project/${project}/session/${session}/track/${track}/seg/${padded}.${ext}`;
}
