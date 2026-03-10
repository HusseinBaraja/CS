/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as categories from '../categories.js';
import type * as companies from '../companies.js';
import type * as companyCleanup from '../companyCleanup.js';
import type * as helpers from '../helpers.js';
import type * as seed from '../seed.js';
import type * as seedData from '../seedData.js';
import type * as vectorSearch from '../vectorSearch.js';

import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';

declare const fullApi: ApiFromModules<{
  categories: typeof categories;
  companies: typeof companies;
  companyCleanup: typeof companyCleanup;
  helpers: typeof helpers;
  seed: typeof seed;
  seedData: typeof seedData;
  vectorSearch: typeof vectorSearch;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
