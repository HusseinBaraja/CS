/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as categories from "../categories.js";
import type * as companies from "../companies.js";
import type * as companyCleanup from "../companyCleanup.js";
import type * as companyRuntime from "../companyRuntime.js";
import type * as conversations from "../conversations.js";
import type * as currencyRates from "../currencyRates.js";
import type * as helpers from "../helpers.js";
import type * as mediaCleanup from "../mediaCleanup.js";
import type * as offers from "../offers.js";
import type * as productMedia from "../productMedia.js";
import type * as products from "../products.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as vectorSearch from "../vectorSearch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  categories: typeof categories;
  companies: typeof companies;
  companyCleanup: typeof companyCleanup;
  companyRuntime: typeof companyRuntime;
  conversations: typeof conversations;
  currencyRates: typeof currencyRates;
  helpers: typeof helpers;
  mediaCleanup: typeof mediaCleanup;
  offers: typeof offers;
  productMedia: typeof productMedia;
  products: typeof products;
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
