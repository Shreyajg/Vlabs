from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
import re
#chunking:

PDF_PATH = "data/FM_Lab_Manual_21CH3DCFML.pdf"

data_loader=PyMuPDFLoader(PDF_PATH)

data=data_loader.load()

current_experiment = None
current_experiment_no = None

experiment_pattern = re.compile(
    r"EXPERIMENT\s*NO\s*:\s*(\d+)",
    re.IGNORECASE
)


for document in data:

    match = experiment_pattern.search(document.page_content)

    if match:
        current_experiment_no = int(match.group(1))

        # Look at the text following "EXPERIMENT NO"
        lines = document.page_content.splitlines()

        for i, line in enumerate(lines):

            if "EXPERIMENT NO" in line.upper():

                if i + 1 < len(lines):
                    current_experiment = lines[i + 1].strip()

                break

    document.metadata["experiment"] = current_experiment
    document.metadata["experiment_no"] = current_experiment_no

splitter=RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=100
)

chunks=splitter.split_documents(
    data
)

print(f"Number of Chunks : {len(chunks)}")

#Embedding model:

embeddings=HuggingFaceEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2"
)

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db"
)

print("Vector database created!")
