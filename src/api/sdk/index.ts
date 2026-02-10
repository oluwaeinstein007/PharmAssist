/**
 * PharmAssist SDK — barrel export
 *
 * Import from here for all client-side integration needs:
 *
 *   // Platform-agnostic client (works everywhere)
 *   import { PharmAssistClient } from '@pharmassist/sdk';
 *
 *   // React hook (web + React Native)
 *   import { usePharmAssist } from '@pharmassist/sdk';
 */

export { PharmAssistClient } from './pharmassist-client.js';
export type {
  PharmAssistConfig,
  ApiResponse,
  ChatResponse,
  SessionState,
  SessionSnapshot,
  CartItem,
  Medicine,
  SearchResult,
  StockResult,
  CartResult,
  StreamEvent,
  StreamCallbacks,
} from './pharmassist-client.js';

// React hook — only import in React/RN environments
export { usePharmAssist } from './usePharmAssist.js';
export type {
  Message,
  ProductOption,
  UsePharmAssistOptions,
  UsePharmAssistReturn,
} from './usePharmAssist.js';
