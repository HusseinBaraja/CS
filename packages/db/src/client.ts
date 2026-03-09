import { requireEnv } from '@cs/config';
import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../../../convex/_generated/api';

export { api as convexApi, internal as convexInternal };

export const createConvexClient = (
  url: string = requireEnv("CONVEX_URL"),
): ConvexHttpClient => new ConvexHttpClient(url);
