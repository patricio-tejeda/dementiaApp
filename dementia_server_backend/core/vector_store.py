# VectorStore - this file is not used currently and all code is in the file sql_loader.py
# later goal is to split the classes into smaller files
import os
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import uuid
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity
import sql_loader


class VectorStore:
    '''manages document embeddings in a chromaDB vector store'''
    def __init__(self, collection_name: str = "sql_documents", persist_directory: str = "../data/vector_store"):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        self._initialize_store()

    def _initialize_store(self):
        '''initialize ChromaDB client and collection'''
        try:
            os.makedirs(self.persist_directory, exist_ok=True)
            self.client = chromadb.PersistentClient(path=self.persist_directory)

            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadate={"description" : "SQL document embeddings for RAG"}
            )
            print(f"Vector store initializec. Collection: {self.collection_name}")
            print(f"Existing documents in collection: {self.collection.count()}")

        except Exception as e:
            print(f"Error initializing vector store: {e}")
            raise

    def add_document(self, documents: List[Any], embeddings: np.ndarray):
        '''add documents and their embeddings to the vector store'''
        if (len(documents) != len(embeddings)):
            raise ValueError("Number of documents must match number of embeddings")
        
        print(f"Addint {len(documents)} documents to vector store...")

        # prepare data for chromadb
        ids = []
        metadatas = []
        documents_text = []
        embeddings_list = []

        for i, (doc, embedding) in enumerate(zip(documents, embeddings)):
            #  generate unique id
            doc_id = f"doc_{uuid.uuid4().hex[:8]}_{i}"
            ids.append(doc_id)

        # prepare metadata
            metadata = Dict(doc.metadata)
            metadata['doc_index'] = i
            metadata['content_lenght'] = len(doc.page_content)
            metadatas.append(metadata)

            # document content
            documents_text.append(doc.page_content)

            # embedding
            embeddings_list.append(embedding.tolist())

            # add to collection
            try:
                self.collection.add(
                    ids=ids,
                    embeddings=embeddings_list,
                    metadata=metadatas,
                    documents=documents_text
                )
                print(f"Successfully added {len(documents)} documents to vector store")
                print(f"Total documents in collection: {self.collection.count()}")

            except Exception as e:
                print(f"Error adding documents to vector store: {e}")
                raise

# initialize vector store
vector_store = VectorStore()
vector_store

# convert the text to embeddings
texts = [doc.page_content for doc in chunks]