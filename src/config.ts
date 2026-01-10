export const env = {
  API_BASE_URL: process.env.UNIFIED_PRODUCTS_BASE_URL || 'https://cc.medplusnig.com/api',
  BEARER_TOKEN: process.env.BEARER_TOKEN || '',
  QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || 'pharmassist',
};
