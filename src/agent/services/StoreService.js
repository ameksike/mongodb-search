import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';
import { filterObject } from '../utils/utl.js';

const COMPONENT = 'service:store';

/**
 * Service for storing and retrieving objects in S3-compatible storage (AWS S3 or MinIO).
 * Used by FilmService for cover image uploads.
 * Config from .env: AWS_REGION, STORE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY;
 * optional STORE_ENDPOINT (MinIO/custom), STORE_PUBLIC_BASE_URL.
 */
export class StoreService {

    /**
     * @param {{ region?: string, bucket: string, accessKeyId?: string, secretAccessKey?: string, endpoint?: string, publicBaseUrl?: string }} options - endpoint: custom URL for MinIO/S3-compatible (e.g. http://localhost:9000); publicBaseUrl overrides default URL construction
     */
    constructor(options = {}) {
        const region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';
        const bucket = options.bucket ?? process.env.STORE_BUCKET;
        const accessKeyId = options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;

        this.endpoint = options.endpoint ?? process.env.STORE_ENDPOINT ?? process.env.STORE_ENDPOINT_URL ?? null;
        this.bucket = bucket;
        this.region = region;
        this.driver = options.driver ?? 'MinIO';

        const clientConfig = {
            region: this.region,
            ...(accessKeyId && secretAccessKey
                ? { credentials: { accessKeyId, secretAccessKey } }
                : {}),
        };

        if (this.driver === 'MinIO') {
            clientConfig.endpoint = this.endpoint;
            clientConfig.forcePathStyle = true;
        }

        this.client = new S3Client(clientConfig);
        this._bucketEnsured = false;
        if (this.endpoint) this.endpoint = this.endpoint.replace(/\/$/, '');

        logger.info(COMPONENT, 'Initialized StoreService', filterObject(clientConfig, ['credentials'], { bucket: this.bucket }));
    }

    /**
     * Read an object from the store by key. Returns the body as a Buffer.
     * @param {string} key - Object key (e.g. "films/uuid/cover.jpg")
     * @returns {Promise<Buffer>} Object body
     */
    async read(key) {
        try {
            if (!this.bucket) throw new Error('Store bucket not configured (STORE_BUCKET)');
            const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
            const res = await this.client.send(command);
            if (!res.Body) return Buffer.alloc(0);
            const chunks = [];
            for await (const chunk of res.Body) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            logger.info(COMPONENT, 'Read complete', { key, size: buffer.length });
            return buffer;
        }
        catch (err) {
            logger.error(COMPONENT, 'Error reading object', { key, error: err.message, code: err.Code, statusCode: err.$metadata?.httpStatusCode });
            throw err;
        }
    }

    /**
     * Derive the object key from a store URL (path-style or virtual-host). Returns null if the URL is not for this store.
     * @param {string} url - Full URL (e.g. http://localhost:9000/films/uuid/cover.jpg)
     * @returns {string | null} Object key or null
     */
    keyFromUrl(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const u = new URL(url);
            const pathSegments = u.pathname.replace(/^\//, '').split('/').filter(Boolean);
            if (pathSegments[0] === this.bucket) return pathSegments.slice(1).join('/');
            return pathSegments.length ? pathSegments.join('/') : null;
        } catch {
            return null;
        }
    }

    /**
     * Read an object by its full store URL. If the URL is not for this store, returns null.
     * @param {string} url - Full URL (e.g. http://localhost:9000/films/uuid/cover.jpg)
     * @returns {Promise<Buffer | null>} Object body or null
     */
    async readFromUrl(url) {
        const key = this.keyFromUrl(url);
        if (!key) return null;
        try {
            return await this.read(key);
        } catch (err) {
            logger.warn(COMPONENT, 'Read from URL failed', { url, key, error: err.message });
            return null;
        }
    }

    /**
     * Ensure the bucket exists (idempotent). Required for MinIO; no-op for AWS if bucket already exists.
     * @private
     */
    async ensureBucket() {
        if (this._bucketEnsured) return;
        try {
            await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch (err) {
            const is404 = err.$metadata?.httpStatusCode === 404
                || err.name === 'NotFound'
                || err.Code === 'NotFound';
            if (is404) {
                await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
                logger.info(COMPONENT, 'Bucket created', { bucket: this.bucket });
            } else {
                throw err;
            }
        }
        this._bucketEnsured = true;
    }

    /**
     * Build the public URL for an object key. Path-style for custom endpoint (MinIO); virtual-host for AWS.
     * @param {string} key
     * @returns {string}
     * @private
     */
    buildPublicUrl(key) {
        if (this.driver === 's3' && this.endpoint) {
            return `${this.endpoint.replace(/\/$/, '')}/${key}`;
        }
        if (this.driver === 'MinIO' && this.endpoint) {
            return `${this.endpoint}/${this.bucket}/${key}`;
        }
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    /**
     * Upload a buffer to S3/MinIO and return the public URL. Key is generated as films/{uuid}/{filename} for uniqueness.
     * @param {Buffer} buffer - File buffer
     * @param {{ contentType?: string, key?: string, filename?: string }} options - contentType for Content-Type header; key overrides generated key; filename used in key when key not provided
     * @returns {Promise<string>} Public URL of the uploaded object
     */
    async upload(buffer, options = {}) {
        if (!this.bucket) {
            throw new Error('S3 bucket not configured (STORE_BUCKET)');
        }
        try {
            // await this.ensureBucket();

            const contentType = options.contentType ?? 'application/octet-stream';
            const key = options.key ?? options.filename ?? this.buildKey('cover');

            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            });

            await this.client.send(command);
            const url = this.buildPublicUrl(key);

            logger.info(COMPONENT, 'Upload complete', { key, url, size: buffer?.length });
            return url;
        }
        catch (err) {
            logger.error(COMPONENT, 'Error ensuring bucket', { error: err.message });
            throw err;
        }
    }

    /**
     * Build a unique key under films/ prefix.
     * @param {string} [filename] - Original filename (sanitized)
     * @private
     */
    buildKey(filename) {
        const uuid = crypto.randomUUID();
        const ext = filename?.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
        const safe = filename?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'cover';
        return `${uuid}/${safe}${ext}`;
    }
}
