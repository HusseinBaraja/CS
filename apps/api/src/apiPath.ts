const API_PATH_PREFIX = "/api";

export const isProtectedApiPath = (path: string): boolean =>
  path === API_PATH_PREFIX || path.startsWith(`${API_PATH_PREFIX}/`);
