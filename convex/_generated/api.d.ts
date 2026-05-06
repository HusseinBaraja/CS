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
import type * as catalogLanguageHints from "../catalogLanguageHints.js";
import type * as categories from "../categories.js";
import type * as companies from "../companies.js";
import type * as companyCleanup from "../companyCleanup.js";
import type * as companyRuntime from "../companyRuntime.js";
import type * as companySettings from "../companySettings.js";
import type * as conversations from "../conversations.js";
import type * as conversations_constants from "../conversations/constants.js";
import type * as conversations_conversation_readers from "../conversations/conversation_readers.js";
import type * as conversations_handoff_resume_activity from "../conversations/handoff_resume_activity.js";
import type * as conversations_handoff_resume_flows from "../conversations/handoff_resume_flows.js";
import type * as conversations_inbound_append_flows from "../conversations/inbound_append_flows.js";
import type * as conversations_inbound_conversation_entrypoints from "../conversations/inbound_conversation_entrypoints.js";
import type * as conversations_lock_helpers from "../conversations/lock_helpers.js";
import type * as conversations_message_helpers from "../conversations/message_helpers.js";
import type * as conversations_pending_assistant_core from "../conversations/pending_assistant_core.js";
import type * as conversations_pending_assistant_lifecycle from "../conversations/pending_assistant_lifecycle.js";
import type * as conversations_pending_assistant_side_effects from "../conversations/pending_assistant_side_effects.js";
import type * as conversations_prompt_history_query from "../conversations/prompt_history_query.js";
import type * as conversations_prompt_history_selection from "../conversations/prompt_history_selection.js";
import type * as conversations_trimming_conversation_message from "../conversations/trimming_conversation_message.js";
import type * as conversations_trimming_list_queries from "../conversations/trimming_list_queries.js";
import type * as conversations_types from "../conversations/types.js";
import type * as currencyRates from "../currencyRates.js";
import type * as helpers from "../helpers.js";
import type * as mediaCleanup from "../mediaCleanup.js";
import type * as offers from "../offers.js";
import type * as productEmbeddingRuntime from "../productEmbeddingRuntime.js";
import type * as productMedia from "../productMedia.js";
import type * as products from "../products.js";
import type * as products_actionDefinitions from "../products/actionDefinitions.js";
import type * as products_actionDefinitions_productActionDefinitions from "../products/actionDefinitions/productActionDefinitions.js";
import type * as products_actionDefinitions_variantActionDefinitions from "../products/actionDefinitions/variantActionDefinitions.js";
import type * as products_embedding from "../products/embedding.js";
import type * as products_errors from "../products/errors.js";
import type * as products_mapping from "../products/mapping.js";
import type * as products_mutationDefinitions from "../products/mutationDefinitions.js";
import type * as products_mutationDefinitions_productMutationDefinitions from "../products/mutationDefinitions/productMutationDefinitions.js";
import type * as products_mutationDefinitions_variantMutationDefinitions from "../products/mutationDefinitions/variantMutationDefinitions.js";
import type * as products_normalization from "../products/normalization.js";
import type * as products_normalizationPrimitives from "../products/normalizationPrimitives.js";
import type * as products_queryDefinitions from "../products/queryDefinitions.js";
import type * as products_queryDefinitions_productQueryDefinitions from "../products/queryDefinitions/productQueryDefinitions.js";
import type * as products_queryDefinitions_snapshotQueryDefinitions from "../products/queryDefinitions/snapshotQueryDefinitions.js";
import type * as products_readers from "../products/readers.js";
import type * as products_stateTransforms from "../products/stateTransforms.js";
import type * as products_types from "../products/types.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as testFixtures from "../testFixtures.js";
import type * as vectorSearch from "../vectorSearch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  catalogLanguageHints: typeof catalogLanguageHints;
  categories: typeof categories;
  companies: typeof companies;
  companyCleanup: typeof companyCleanup;
  companyRuntime: typeof companyRuntime;
  companySettings: typeof companySettings;
  conversations: typeof conversations;
  "conversations/constants": typeof conversations_constants;
  "conversations/conversation_readers": typeof conversations_conversation_readers;
  "conversations/handoff_resume_activity": typeof conversations_handoff_resume_activity;
  "conversations/handoff_resume_flows": typeof conversations_handoff_resume_flows;
  "conversations/inbound_append_flows": typeof conversations_inbound_append_flows;
  "conversations/inbound_conversation_entrypoints": typeof conversations_inbound_conversation_entrypoints;
  "conversations/lock_helpers": typeof conversations_lock_helpers;
  "conversations/message_helpers": typeof conversations_message_helpers;
  "conversations/pending_assistant_core": typeof conversations_pending_assistant_core;
  "conversations/pending_assistant_lifecycle": typeof conversations_pending_assistant_lifecycle;
  "conversations/pending_assistant_side_effects": typeof conversations_pending_assistant_side_effects;
  "conversations/prompt_history_query": typeof conversations_prompt_history_query;
  "conversations/prompt_history_selection": typeof conversations_prompt_history_selection;
  "conversations/trimming_conversation_message": typeof conversations_trimming_conversation_message;
  "conversations/trimming_list_queries": typeof conversations_trimming_list_queries;
  "conversations/types": typeof conversations_types;
  currencyRates: typeof currencyRates;
  helpers: typeof helpers;
  mediaCleanup: typeof mediaCleanup;
  offers: typeof offers;
  productEmbeddingRuntime: typeof productEmbeddingRuntime;
  productMedia: typeof productMedia;
  products: typeof products;
  "products/actionDefinitions": typeof products_actionDefinitions;
  "products/actionDefinitions/productActionDefinitions": typeof products_actionDefinitions_productActionDefinitions;
  "products/actionDefinitions/variantActionDefinitions": typeof products_actionDefinitions_variantActionDefinitions;
  "products/embedding": typeof products_embedding;
  "products/errors": typeof products_errors;
  "products/mapping": typeof products_mapping;
  "products/mutationDefinitions": typeof products_mutationDefinitions;
  "products/mutationDefinitions/productMutationDefinitions": typeof products_mutationDefinitions_productMutationDefinitions;
  "products/mutationDefinitions/variantMutationDefinitions": typeof products_mutationDefinitions_variantMutationDefinitions;
  "products/normalization": typeof products_normalization;
  "products/normalizationPrimitives": typeof products_normalizationPrimitives;
  "products/queryDefinitions": typeof products_queryDefinitions;
  "products/queryDefinitions/productQueryDefinitions": typeof products_queryDefinitions_productQueryDefinitions;
  "products/queryDefinitions/snapshotQueryDefinitions": typeof products_queryDefinitions_snapshotQueryDefinitions;
  "products/readers": typeof products_readers;
  "products/stateTransforms": typeof products_stateTransforms;
  "products/types": typeof products_types;
  seed: typeof seed;
  seedData: typeof seedData;
  testFixtures: typeof testFixtures;
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
