import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import {
  createDefinition,
  createVariantDefinition,
  removeVariantDefinition,
  updateDefinition,
  updateVariantDefinition,
} from './products/actionDefinitions';
import {
  insertProductWithEmbeddingsDefinition,
  insertVariantWithEmbeddingsDefinition,
  patchProductWithEmbeddingsDefinition,
  patchVariantWithEmbeddingsDefinition,
  removeDefinition,
  removeVariantWithEmbeddingsDefinition,
} from './products/mutationDefinitions';
import {
  categoryExistsForCompanyDefinition,
  getCreateContextDefinition,
  getDefinition,
  getManyForRagDefinition,
  getUpdateSnapshotDefinition,
  getVariantCreateSnapshotDefinition,
  getVariantUpdateSnapshotDefinition,
  listDefinition,
  listVariantsDefinition,
} from './products/queryDefinitions';

export const list = internalQuery(listDefinition);
export const get = internalQuery(getDefinition);
export const getManyForRag = internalQuery(getManyForRagDefinition);
export const listVariants = internalQuery(listVariantsDefinition);
export const getCreateContext = internalQuery(getCreateContextDefinition);
export const getUpdateSnapshot = internalQuery(getUpdateSnapshotDefinition);
export const getVariantCreateSnapshot = internalQuery(getVariantCreateSnapshotDefinition);
export const getVariantUpdateSnapshot = internalQuery(getVariantUpdateSnapshotDefinition);
export const categoryExistsForCompany = internalQuery(categoryExistsForCompanyDefinition);
export const insertProductWithEmbeddings = internalMutation(insertProductWithEmbeddingsDefinition);
export const patchProductWithEmbeddings = internalMutation(patchProductWithEmbeddingsDefinition);
export const insertVariantWithEmbeddings = internalMutation(insertVariantWithEmbeddingsDefinition);
export const patchVariantWithEmbeddings = internalMutation(patchVariantWithEmbeddingsDefinition);
export const removeVariantWithEmbeddings = internalMutation(removeVariantWithEmbeddingsDefinition);
export const create = internalAction(createDefinition);
export const update = internalAction(updateDefinition);
export const createVariant = internalAction(createVariantDefinition);
export const updateVariant = internalAction(updateVariantDefinition);
export const removeVariant = internalAction(removeVariantDefinition);
export const remove = internalMutation(removeDefinition);
