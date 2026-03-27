# based off: https://www.youtube.com/watch?v=o126p1QN_RI
from langchain_core.documents import Document
from langchain_community.document_loaders import TextLoader
from langchain_community.document_loaders import DirectoryLoader
from langchain_community.vectorstores import SQLiteVec
from langchain_community.document_loaders import SQLDatabaseLoader
from langchain_community.utilities import SQLDatabase
import os

# for slideshow need to refine diagram and add symbols to define each type of event (cloud, database, etc.)

# here is where you put the sql document with all the information
doc = Document(page_content="", metadata={"source":"", "pages": 1, "author": "me"})
# can apply filters during search using the metadata (so far this is an example)

# create a simple txt file (perhaps change to sql later)
os.makedirs("/data/textFiles", exist_ok=True)

# the python_intro.txt is an example of a saved document --> will be saved into sqlite later
sample_texts = {"data/textFiles/python_intro.txt": """Python programming intorduction"""}

for filepath,content in sample_texts.items():
    with open(filepath, 'w', encoding="utf-8") as f:
        f.write(content)

print("sample text file created")

loader = TextLoader("/data/textFiles/python_intro.txt", encoding="utf-8")
document = loader.load()
print(document)

# glob -> matches file types; make show_progress=True to see the progress bar but must install tqdm
dir_loader = DirectoryLoader("data/tesxtFiles", glob="**/*.txt", loader_cls=TextLoader, loader_kwargs={"encoding": "utf-8"}, show_progress=False)
documents = dir_loader.load()
print(documents)

# use the sqlite database for the patients
db = SQLDatabase.from_uri("sqlite:///path/to/your/database.db")
directory_loader = SQLDatabaseLoader(
    query="",
    loader_cls=TextLoader,
    db=db, 
    loader_kwargs={"encoding": "utf-8"}, 
    show_progress=False)