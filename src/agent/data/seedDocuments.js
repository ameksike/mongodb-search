/**
 * Seed documents for the RAG demo. Import this array to run seed/ingest.
 * @type {{ sourceId: string, title: string, url: string, text: string }[]}
 */
export const seedDocuments = [
    {
        sourceId: 'doc-manual-001',
        title: 'Product Manual',
        url: 'https://example.com/manual',
        text: 'This product manual describes the main features of the device. Always power off before opening the case. Use the reset button only when the system is unresponsive. Warranty is valid for 12 months from purchase date. Contact support at support@example.com for replacements.',
    },
    {
        sourceId: 'doc-faq-002',
        title: 'FAQ',
        url: 'https://example.com/faq',
        text: 'Frequently asked questions: How do I reset my password? Go to Account Settings and click Forgot password. How do I enable two-factor authentication? In Security settings, enable 2FA and follow the SMS or app setup. Refunds are processed within 5 business days.',
    },
    {
        sourceId: 'doc-policy-003',
        title: 'Privacy Policy',
        url: 'https://example.com/privacy',
        text: 'We collect only the data necessary to provide the service. We do not sell your personal data. Data is stored in encrypted form. You can request deletion of your data at any time by contacting privacy@example.com. Our privacy policy was last updated in 2024.',
    },
    {
        sourceId: 'doc-api-004',
        title: 'API Overview',
        url: 'https://example.com/docs/api',
        text: 'The REST API uses JSON. Base URL: https://api.example.com/v1. Authentication is via Bearer token in the Authorization header. Rate limit is 1000 requests per hour. Endpoints: GET /users, POST /users, GET /users/:id. All dates are in ISO 8601 format.',
    },
];
