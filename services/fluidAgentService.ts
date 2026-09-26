const API_URL = "http://127.0.0.1:8000";

export interface ChatRequest {
  question: string;
}

export interface ChatResponse {
  answer: {
    type: string;
    text: string;
    extras?: Record<string, unknown>;
  }[];
  time_seconds?: number;
}

export async function askFluidAgent(
  request: ChatRequest
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`AI service error: ${response.status}`);
  }

  return response.json();
}