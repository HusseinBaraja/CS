export interface RetrievalResult {
  id: string;
  score: number;
}

export const retrieve = async (): Promise<RetrievalResult[]> => {
  return [];
};
