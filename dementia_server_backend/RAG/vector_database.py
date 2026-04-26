import os
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import uuid
import faiss
import pickle
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity
from RAG.embedding import EmbeddingPipeline

class VectorStore:
    def __init__(self, persist_dir: str = "faiss_store", embedding_model: str = "all-MiniLM-L6-v2", chunk_size: int =1000, chunk_overlap: int=200):
        self.persist_dir = persist_dir
        os.makedirs(self.persist_dir, exist_ok=True)
        self.index = None
        self.metadata = []
        self.embedding_model = embedding_model
        if not hasattr(self, "model"):
            self.model = SentenceTransformer(embedding_model)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        print(f"[INFO] Loading embedded mode: {embedding_model}")

    def build_from_document(self, documents: List[Any]):
        print(f"[INFO] Building vector store from {len(documents)} raw documents...")
        embed_pipeline = EmbeddingPipeline(model_name=self.embedding_model, chunk_size=self.chunk_size, chunk_overlap=self.chunk_overlap)
        # chunks = embed_pipeline.chunk_documents(documents)
        chunks, embeddings = embed_pipeline.embed_docs(documents)
        metadatas = [{"text": chunk.page_content} for chunk in chunks]
        self.add_embeddings(np.array(embeddings).astype("float32"), metadatas)
        self.save()
        print(f"[INFO] Vector store built and saved to {self.persist_dir}")

    def add_embeddings(self, embeddings: np.ndarray, metadatas: List[Any] = None):
        dimensions = embeddings.shape[1]
        if self.index is None:
            self.index = faiss.IndexFlatL2(dimensions)
        self.index.add(embeddings)
        if metadatas:
            self.metadata.extend(metadatas)
        print(f"[INFO] Added {embeddings.shape[0]} vectors to faiss index")

    def save(self):
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pk1")
        faiss.write_index(self.index, faiss_path)
        with open(meta_path, 'wb') as f:
            pickle.dump(self.metadata, f)
        print(f"[INFO] Saved faiss info and metadata to {self.persist_dir}")

    def load(self):
        faiss_path = os.path.join(self.persist_dir,"faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pk1")
        self.index = faiss.read_index(faiss_path)
        with open(meta_path, 'rb') as f:
            self.metadata = pickle.load(f)
        print(f"[INFO] Loaded Faiss index and metadata from {self.persist_dir}")

    def search(self, query_embedding: np.ndarray, top_k: int = 5):
        D, I = self.index.search(query_embedding, top_k)
        results = []
        for idx, dist in zip(I[0], D[0]):
            meta = self.metadata[idx] if idx < len(self.metadata) else None
            results.append({"index": idx, "distance": dist, "metadata": meta})
        return results
    
    def query(self, query_text: str, top_k: int = 5):
        query_embedding = self.model.encode([query_text]).astype("float32")
        D, I = self.index.search(query_embedding, top_k)
        results = []
        for idx, dist in zip(I[0], D[0]):
            meta = self.metadata[idx] if idx < len(self.metadata) else None
            results.append({
            "index": int(idx),
            "distance": float(dist),
            "metadata": meta
            })
        return results
