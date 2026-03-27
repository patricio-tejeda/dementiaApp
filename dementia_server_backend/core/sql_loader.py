# RAG Pipeline - Data injestion to database pipeline

from langchain_community.vectorstores import SQLiteVec
from langchain_community.document_loaders import SQLDatabaseLoader
from langchain_community.utilities import SQLDatabase
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path

def process_all_sql(sql_directory):
    all_documents = []
    sql_dir = Path(sql_directory)