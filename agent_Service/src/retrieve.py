from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma


embeddings=HuggingFaceEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2"
)

vectorstore=Chroma(
    persist_directory='./chroma_db',
    embedding_function=embeddings,

)

retriever=vectorstore.as_retriever(
    search_kwargs={"k":5},
    filter={
        "experimeter":"VENTURI METER"
    }
)

query="Venturimeter principle pressure velocity energy conservation"

results=retriever.invoke(query)

for i,doc in enumerate(results):
    print(f"\n result {i+1}")
    print(f"\n page: {doc.metadata.get("page")}")
    print(f"\n content : {doc.page_content[:1000]}")