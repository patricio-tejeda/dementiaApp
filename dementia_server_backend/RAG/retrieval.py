from RAG.vector_database import VectorStore
from RAG.groq_client import build_chat_groq



class RAGSearch:
    def __init__(self, persist_dir: str = "faiss_store", embedding_model: str = "all-MiniLM-L6-v2", llm_model: str =  "llama-3.1-8b-instant", chunk_size: int =1000, chunk_overlap: int=200):
        self.persist_dir = persist_dir
        self.vectorstore = VectorStore(persist_dir, embedding_model)
        faiss_path = os.path.join(self.persist_dir,"faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pk1")
        if not (os.path.exists(faiss_path) and os.path.exists(meta_path)):
            from RAG.data_loader import process_all_sql
            docs = process_all_sql("data")
            self.vectorstore.build_from_document(docs)
        else:
            self.vectorstore.load()
        # initialize grog llm
        self.llm = build_chat_groq(llm_model)
        print(f"[INFO] Groq LLM initialized: {llm_model}")

    def search_and_summarize(self, query: str, top_k: int = 5) -> str:
        results = self.vectorstore.query(query, top_k=top_k)
        texts = [r["metadata"].get("text", "") for r in results if r["metadata"]]
        context = "\n\n".join(texts)
        if not context:
            return "No relevent documents found"
        prompt = f"""
                You are helping generate memory questions for a dementia patient.

                Based on the context below, create ONE multiple choice question with 4 options and indicate the correct answer.

                Query:
                {query}

                Context:
                {context}
                """
        response = self.llm.invoke(prompt)
        return response.content

# example usage
# if __name__ == "__main__":
#     rag_search = RAGSearch()
#     query = "What is the patients' mother's name?"
#     summary = rag_search.search_and_summarize(query, top_k = 3)
#     print(f"summary: {summary}")
