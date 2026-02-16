import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';

const COMPONENT = 's3';

/**
 * Service for storing and retrieving objects in AWS S3. Used by FilmService for cover image uploads.
 * Config from .env: AWS_REGION, STORE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY; optional STORE_PUBLIC_BASE_URL.
 */
export class S3Service {

    /**
     * @param {{ region: string, bucket: string, accessKeyId?: string, secretAccessKey?: string, publicBaseUrl?: string }} options - S3 config; publicBaseUrl overrides default URL construction (e.g. CloudFront)
     */
    constructor(options = {}) {
        const region = options.region ?? process.env.AWS_REGION;
        const bucket = options.bucket ?? process.env.STORE_BUCKET;
        const accessKeyId = options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;

        this.bucket = bucket;
        this.publicBaseUrl = options.publicBaseUrl ?? process.env.STORE_PUBLIC_BASE_URL ?? null;

        this.region = region ?? 'us-east-1';
        this.client = new S3Client({
            region: this.region,
            ...(accessKeyId && secretAccessKey
                ? { credentials: { accessKeyId, secretAccessKey } }
                : {}),
        });
    }

    /**
     * Upload a buffer to S3 and return the public URL. Key is generated as films/{uuid}/{filename} for uniqueness.
     * @param {Buffer} buffer - File buffer
     * @param {{ contentType?: string, key?: string, filename?: string }} options - contentType for Content-Type header; key overrides generated key; filename used in key when key not provided
     * @returns {Promise<string>} Public URL of the uploaded object
     */
    async upload(buffer, options = {}) {
        if (!this.bucket) {
            throw new Error('S3 bucket not configured (STORE_BUCKET)');
        }

        const contentType = options.contentType ?? 'application/octet-stream';
        const key = options.key ?? this.buildKey(options.filename ?? 'cover');

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        });

        await this.client.send(command);
        const url = this.publicBaseUrl
            ? `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
            : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

        logger.info(COMPONENT, 'Upload complete', { key, size: buffer.length });
        return url;
    }

    /**
     * Build a unique key under films/ prefix.
     * @param {string} [filename] - Original filename (sanitized)
     * @private
     */
    buildKey(filename = 'cover') {
        const uuid = crypto.randomUUID();
        const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
        const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'cover';
        return `films/${uuid}/${safe}${ext}`;
    }
}
