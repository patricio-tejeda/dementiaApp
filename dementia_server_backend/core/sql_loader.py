# RAG Pipeline - Data injestion to database pipeline

# for chunking ----------------------------------------
from langchain_community.vectorstores import SQLiteVec
from langchain_community.document_loaders import SQLDatabaseLoader
from langchain_community.utilities import SQLDatabase
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path

# for embedding -------------------------------------
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import uuid
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity

# for retrieval --------------------------------------
from langchain_groq import ChatGroq
from dotenv import load_dotenv
load_dotenv()

# initialize grog llm
groq_api_key = os.getenv("GROQ_API_KEY") # test by hardcoding key

def process_all_sql(sql_directory):
    all_documents = []
    sql_dir = Path(sql_directory)

    # find all sql files recursively
    sql_files = list(sql_dir.glob("**.sqlite3"))

    print(f"found {len(sql_files)} sqlite files")

    for sql_file in sql_files:
        print(f"\nProcessing {sql_file.name}")
        try:
            loader = SQLDatabaseLoader(str(sql_file))
            documents = loader.load()

            for doc in documents:
                doc.metadata['source_file'] = sql_file.name
                doc.metadata['file_type'] = 'sqlite3'

            all_documents.extend(documents)
            print(f"loaded {len(documents)} documents")

        except Exception as e:
            print(f"Error: {e}")

    return all_documents

all_sql_docs = process_all_sql("../dementia_server_backend")

# text splitting/chunking
def split_documents(documents, chunk_size=1000, chunk_overlap=200):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        length_function = len,
        seperators = ["\n\n", "\n", " ", ""]
        )
    split_docs = text_splitter.split_documents(documents)
    # validate that the splitting worked
    print(f"split {len(documents)} documents into {len(split_docs)} chunks")

    # example of a chunk
    if split_docs:
        print(f"\nExample chunk:")
        print(f"Content: {split_docs[0].page_content[:200]}...")
        print(f"Metadata: {split_docs[0].metadata}")

    return split_docs

chunks = split_documents(all_sql_docs) # chunks defined here (will need to find a way to translate this tp vector_store.py)

# Embedding and vector store database --------------------------------------------
class EmbeddingManager:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        '''load the sentenceTransformer model'''
        try:
            print(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            print(f"Model loaded successfully. Embedding dimensions = {self.model.get_sentence_embedding_dimension()}") # not necessary
        except Exception as e:
            print(f"error loading model {self.model_name} : {e}")
            raise

    def generate_embeddings(self, texts: List[str]) -> np.ndarray:
        '''generates embeddings for a list of text'''
        if not self.model:
            raise ValueError("Model not loaded")
        print(f"Generate embeddings for {len(texts)} texts...")
        embeddings = self.model.encode(texts, show_progress_bar=True)
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings
    
    # function not necessary
    def get_embedding_dimension(self) -> int:
        '''gets the embedding dimensions of the model'''
        if not self.model:
            raise ValueError("Model not loaded")
        return self.model.get_sentence_embedding_dimension()
    
# initialize the embeddingManager
embedding_manager = EmbeddingManager()
embedding_manager

# VectorStore --------------------------------------------------
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
texts # calls all the texts

# generate the embeddings
embeddings = embedding_manager.generate_embeddings(texts)

# store in the vector database
vector_store.add_document(chunks, embeddings)

# RAG Retriever pipeline from vector store -------------------------
# the query = the prompt from the app to the ai, (ex: make a multiple choice question based on some of the information from the database)
class RAGRetriever:
    '''handles query based retrieval from the vector store'''
    def __init__(self, vector_store: VectorStore, embedding_manager: EmbeddingManager):
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager

    # helps get the specific context for the AI
    def retrieve(self, query: str, top_k: int = 5, score_threshold: float = 0.0) -> List[Dict[str, Any]]:
        '''Retrieve relevant documents for a query
         
        query = the search query (search parameter for the rag llm)
        top_k = the top k number of results to return
        score_threshold = minimum similarity score threshold

        returns a list of the top results (list of dictionaries containing retrieved documents and metadata)
        '''
        # debug
        print(f"Retrieving documents for query: {query}")
        print(f"Top K: {top_k}, Score threshold: {score_threshold}")

        # generate query embedding
        query_embedding = self.embedding_manager.generate_embeddings([query])[0]

        # search in the vector store
        try:
            results = self.vector_store.collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results = top_k 
            )

            # process results
            retrieved_docs = []

            if results['documents'] and results['documents'][0]:
                documents = results['documents'][0]
                metadatas = results['metadatas'][0]
                distances = results['dictances'][0]
                ids = results['ids'][0]

                for i, (doc_id, document, metadata, distance) in enumerate(zip(ids, documents, metadatas, distances)):
                    # convert distance to similarity score (cosine distance used from Chromadb)
                    similarity_score = 1 - distance

                    if similarity_score >= score_threshold:
                        retrieved_docs.append({
                            'id':doc_id,
                            'content':document,
                            'metadata':metadata,
                            'similarity_score':similarity_score,
                            'distance':distance,
                            'rank': i + 1
                        })
                print(f"Retrieved {len(retrieved_docs)} documents (after filtering)")

            else:
                print(f"No documents found")

            return retrieved_docs
        except Exception as e:
            print(f"Error during retrieval: {e}")
            return []
        
# for testing purposes
rag_retriever = RAGRetriever(vector_store, embedding_manager)
rag_retriever.retrieve("What is the patients' mom's birthday?") # this is the context now (see system diagram)

# Integration vectorDB context pipeline with llm output ----------------------------------
# simple rag pipeline with groq llm
'''
if groq_llm:
    query = "What is the mother's name and date of birth?"
    retrieved_docs = rag_retriever.retrieve(query, top_k=3, score_threshold=0.1)
    if retrieved_docs:
        combined_context = "\n\n".join([doc['content'] for doc in retrieved_docs])

        # generate response using grog llm
        response = groq_llm.generate_response(query, combined_context)
        print(f"\nResponse: \n{response}")
    else:
        print(f"No relevant documents found for query")
'''

# initialize groq
llm = ChatGroq(groq_api_key = groq_api_key, model_name = "gemma2-9b-it", temperature=0.1, max_tokens=1024)

# simple rag function - retrieve context + generate response
def simple_rag(query, retriever, llm, top_k=3):
    # retrieve the context
    results = retriever.retrieve(query, top_k=top_k)
    context = "\n\n".join([doc['content'] for doc in results]) if results else ""
    if not context:
        return "no relevant context found"
    
    # generate the answer
    # prompt hardcoded for testing purposes
    # prompt = "What is the users' mother's name and date of birth?" # change this later to be randomized and the decision of the AI
    prompt = f"""Use the following context to answer the question concisely.
            Context: 
            {context}
            Question: {query}
            
            Answer: """
    response = llm.invoke([prompt.format(context = context, query = query)])
    return response.content

# call for testing purposes
answer = simple_rag("What is the users' mother's name and date of birth?", rag_retriever, llm)
print(answer)

# enhanced features for the rag pipeline