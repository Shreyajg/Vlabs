from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.chat import ask_fluid_agent

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str


@app.get("/")
def root():
    return {
        "status": "Fluid AI service running"
    }


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):

    answer = ask_fluid_agent(request.question)

    return {
        "answer": answer
    }