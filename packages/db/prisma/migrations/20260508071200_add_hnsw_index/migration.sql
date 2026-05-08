-- ProjectDocument.embedding(vector(1536))の HNSW 近似最近傍探索インデックス。
-- text-embedding-3-small は L2 正規化済みのため、コサイン類似度演算子を採用(ADR-005、data-model.md)。
CREATE INDEX "ProjectDocument_embedding_hnsw_idx"
  ON "ProjectDocument"
  USING hnsw (embedding vector_cosine_ops);
