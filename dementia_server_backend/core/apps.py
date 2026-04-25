from django.apps import AppConfig
from RAG.data_loader import process_all_sql
from RAG.embedding import EmbeddingPipeline
from RAG.vector_database import VectorStore
from RAG.retrieval import RAGSearch

if __name__ == '__main__':
    docs = process_all_sql('../dementia_server_backend')
    print(f"TOTAL DOCS: {len(docs)}")
    for d in docs:
        print(d.metadata)
    # chunks = EmbeddingPipeline().chunk_documents(docs)
    # chunkvectors = EmbeddingPipeline().embed_docs(chunks)
    # print(chunkvectors)

    # pipeline = EmbeddingPipeline()
    # chunks, embeddings = pipeline.embed_docs(docs)
    # for chunk in chunks:
    #     print(chunk.page_content[:100])

    store = VectorStore("faiss_store")
    # store.build_from_document(docs) // already made so now don't need to fo this part anymore
    store.load()
    print(store.query("What is the patients' mother's name?", top_k = 3))

    rag_search = RAGSearch()
    query = "What is the patients' mother's name?"
    summary = rag_search.search_and_summarize(query, top_k = 3)
    print(f"summary: {summary}") 

class CoreConfig(AppConfig):
    name = 'core'
