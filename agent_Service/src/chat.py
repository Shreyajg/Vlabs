import os

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

load_dotenv()

if not os.getenv("GOOGLE_API_KEY"):
    raise ValueError("Google API key not found in .env")


# -----------------------------
# Embeddings
# -----------------------------

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)


# -----------------------------
# Vector database
# -----------------------------

vectorstore = Chroma(
    persist_directory="./chroma_db",
    embedding_function=embeddings
)

retriever = vectorstore.as_retriever(
    search_kwargs={"k": 3}
)


# -----------------------------
# Gemini
# -----------------------------

llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash"
)


# -----------------------------
# System instructions
# -----------------------------

system_prompt = """You are an AI assistant for a Fluid Mechanics laboratory.

The laboratory manual is the AUTHORITATIVE SOURCE for
laboratory-specific information.

IMPORTANT:

1. Use the retrieved laboratory manual context to answer
   Fluid Mechanics questions if there is nothing related to it in the manual then use your knowledge.

2. When the laboratory manual provides a specific value,
   threshold, formula, range, definition, or procedure,
   use EXACTLY what is stated in the manual.

3. Do NOT replace, modify, supplement, or contradict the
   laboratory manual using general textbook knowledge.

4. If the manual states:
   - Laminar flow: NRe < 2100
   - Turbulent flow: NRe > 4000
   use those values exactly.

5. If the manual does not contain enough information to
   answer something, say that the information is not
   available in the laboratory manual.

6. The student may provide experimental values directly
   in their question. You may reason about those values
   using the information from the laboratory manual.

7. Do not invent experimental values.

8. Clearly distinguish between information from the
   laboratory manual and your interpretation of values
   provided by the student.
9.Keep the answers clear and precise no need to make certain parts bold
"""


def ask_fluid_agent(question: str) -> str:

    # Retrieve relevant sections from the manual
    documents = retriever.invoke(question)

    context_parts = []

    for document in documents:
        page = document.metadata.get("page", "Unknown")

        context_parts.append(
            f"[Page {page}]\n{document.page_content}"
        )

    context = "\n\n".join(context_parts)

    prompt = f"""
{system_prompt}

LABORATORY MANUAL CONTEXT:
--------------------------
{context}
--------------------------

STUDENT QUESTION:
{question}

Answer the student's question using the laboratory
manual context above.
"""

    response = llm.invoke(prompt)

    return response.content


# -----------------------------
# Local testing
# -----------------------------

if __name__ == "__main__":

    question = input(
        "A doubt in Fluid Mechanics? Ask away! "
    )

    answer = ask_fluid_agent(question)

    print("\n" + "=" * 60)
    print("ANSWER")
    print("=" * 60)

    print(answer)