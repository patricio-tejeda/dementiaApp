from langchain_community.utilities import SQLDatabase
from pathlib import Path
from typing import List, Any
from langchain_core.documents import Document
import re
from sqlalchemy import text

ALLOWED_TABLES = [
    "core_inputinfopage",
    "core_patientprofile",
    "core_diaryentry",
]


def process_all_sql(sql_directory: str) -> List[Any]:
    all_documents = []
    sql_dir = Path(sql_directory).resolve()

    sql_files = list(sql_dir.glob("**/*.sqlite3"))
    print(f"found {len(sql_files)} sqlite files")

    for sql_file in sql_files:
        print(f"\nProcessing {sql_file.name}")
        try:
            db_uri = f"sqlite:///{sql_file}"
            db = SQLDatabase.from_uri(db_uri)

            tables = db.get_usable_table_names()
            filtered_tables = [t for t in tables if t in ALLOWED_TABLES]

            with db._engine.connect() as conn:
                for table in filtered_tables:
                    print(f"processing table: {table}")

                    if table == "core_inputinfopage":
                        query = """
                            SELECT title, answer
                            FROM core_inputinfopage
                            WHERE answer IS NOT NULL AND answer != ''
                        """
                        result = conn.execute(text(query))
                        rows = list(result)
                        print(f"[DEBUG] Rows returned: {len(rows)}")

                        for row in rows:
                            question = row[0]
                            answer = row[1]
                            if not answer or not answer.strip():
                                continue
                            doc = Document(
                                page_content=f"Patient Fact:\nQuestion: {question}\nAnswer: {answer}",
                                metadata={
                                    "source_file": sql_file.name,
                                    "table": table,
                                    "type": "patient_memory",
                                }
                            )
                            all_documents.append(doc)

                    elif table == "core_diaryentry":
                        query = """
                            SELECT date, text
                            FROM core_diaryentry
                            WHERE text IS NOT NULL AND text != ''
                            ORDER BY date DESC
                        """
                        result = conn.execute(text(query))
                        rows = list(result)
                        print(f"[DEBUG] Diary rows returned: {len(rows)}")

                        for row in rows:
                            date = row[0]
                            entry_text = row[1]
                            if not entry_text or not entry_text.strip():
                                continue
                            doc = Document(
                                page_content=f"Diary Entry ({date}):\n{entry_text}",
                                metadata={
                                    "source_file": sql_file.name,
                                    "table": table,
                                    "type": "diary_entry",
                                    "date": str(date),
                                }
                            )
                            all_documents.append(doc)

                    else:
                        continue

            print("loaded document")

        except Exception as e:
            print(f"Error: {e}")

    return all_documents


def clean_schema(text):
    return re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)