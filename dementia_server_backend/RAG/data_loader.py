from langchain_community.vectorstores import SQLiteVec
from langchain_community.document_loaders import SQLDatabaseLoader
from langchain_community.utilities import SQLDatabase
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path
from typing import List, Any
from langchain_community.document_loaders import JSONLoader
from langchain_core.documents import Document
import re
from sqlalchemy import text

ALLOWED_TABLES = [
    "core_inputinfopage",
    "core_patientprofile"
]

def process_all_sql(sql_directory: str) -> List[Any]:
    all_documents = []
    sql_dir = Path(sql_directory).resolve()

    # find all sql files recursively
    sql_files = list(sql_dir.glob("**/*.sqlite3"))
    print(f"found {len(sql_files)} sqlite files")

    for sql_file in sql_files:
        print(f"\nProcessing {sql_file.name}")
        try:
            db_uri = f"sqlite:///{sql_file}"
            db = SQLDatabase.from_uri(db_uri)

            # only get the necessary rows (only the patient info and profile, no passwords/adimin info)
            tables = db.get_usable_table_names()
            filtered_tables = [t for t in tables if t in ALLOWED_TABLES]
            schema_info = clean_schema(db.get_table_info(filtered_tables))

            schema_doc = Document(
                page_content=f"""
                        Database: {sql_file.name}

                        Schema:
                        {schema_info}
                        """,
                        metadata={
                            "source_file": sql_file.name,
                            "type": "schema"
                        }
                    )

            # all_documents.append(schema_doc)
            print("loaded schema document")

            with db._engine.connect() as conn:
                for table in filtered_tables:
                    print(f"processing table: {table}")
                    if table == "core_inputinfopage":
                        query = """
                                SELECT title, answer
                                FROM core_inputinfopage
                                WHERE answer IS NOT NULL
                                """
                    else:
                        continue
                    result = conn.execute(text(query))
                    rows = list(result)
                    print(f"[DEBUG] Rows returned: {len(rows)}")

                    # for row in result:
                    for row in rows:
                        question = row[0]
                        answer = row[1]
                        if not answer:
                            continue

                        doc = Document(page_content=f"""
                                Patient Fact:
                                Question: {question}
                                Answer: {answer}
                                """,
                                metadata={
                                    "source_file": sql_file.name,
                                    "table": table,
                                    "type": "patient_memory"}
                                )
                        all_documents.append(doc)
            # schema_doc = Document(
            #     page_content=schema_info,
            #     metadata={
            #         "source_file": sql_file.name,
            #         "file_type": "sqlite3_schema"
            #     }
            # )

            print("loaded document")

        except Exception as e:
            print(f"Error: {e}")

    return all_documents 

def clean_schema(text):
    return re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)