import numpy as np
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb
from chromadb.config import Settings
import uuid
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity
from RAG.data_loader import process_all_sql

class EmbeddingPipeline:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", chunk_size: int = 1000,  chunk_overlap=200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.model = SentenceTransformer(model_name)
        print(f"[INFO] Loading embedding model: {model_name}")

    def chunk_documents(self, documents: List[Any]) -> List[Any]:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size = self.chunk_size,
            chunk_overlap = self.chunk_overlap,
            length_function = len,
            separators = ["\n\n", "\n", " ", ""]
            )
        split_docs = text_splitter.split_documents(documents)
        print(f"[INFO] Split {len(documents)} documents into {len(split_docs)} chunks")
        return split_docs
    
    def embed_docs(self, documents: List[Any]) -> np.ndarray:
        chunks = self.chunk_documents(documents)
        embeddings = self.model.encode([chunk.page_content for chunk in chunks], show_progress_bar=True)
        print(f"[INFO] Created embeddings for {len(embeddings)} chunks")
        return chunks, embeddings