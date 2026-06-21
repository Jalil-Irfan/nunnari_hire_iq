import asyncio
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from pydantic import BaseModel
import json
from ai_pipeline import process_resume_pipeline

app = FastAPI(title="HireIQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DS Concept: Queue (Buffer)
processing_queue: asyncio.Queue = asyncio.Queue()

# SSE Event Queues per job
job_event_queues: Dict[str, asyncio.Queue] = {}

async def resume_worker():
    """Background worker that processes items from the queue."""
    while True:
        job_id, filename, content, jd, mode = await processing_queue.get()
        print(f"Processing job {job_id} for file {filename} in {mode} mode")
        
        try:
            # Iterate through the async generator yielding LangGraph updates
            async for event in process_resume_pipeline(job_id, filename, content, jd, mode):
                if job_id in job_event_queues:
                    await job_event_queues[job_id].put(event)
        except Exception as e:
            error_event = {"type": "error", "error": str(e)}
            if job_id in job_event_queues:
                await job_event_queues[job_id].put(error_event)
            print(f"Error processing job {job_id}: {e}")
            
        processing_queue.task_done()

@app.on_event("startup")
async def startup_event():
    # Start the background worker
    asyncio.create_task(resume_worker())

MAX_FILE_SIZE = 5 * 1024 * 1024 # 5MB

@app.post("/upload")
async def upload_resume(file: UploadFile = File(...), jd: str = Form(default=""), mode: str = Form(default="deterministic")):
    """Upload a resume and start asynchronous processing."""
    if file.content_type != "application/pdf":
        return {"error": "Invalid file format. Only PDFs are supported."}
        
    job_id = str(uuid.uuid4())
    content = await file.read()
    
    if len(content) > MAX_FILE_SIZE:
        return {"error": "File exceeds 5MB limit."}
    
    # Initialize the event queue for this job
    job_event_queues[job_id] = asyncio.Queue()
    
    # Enqueue job for background processing
    await processing_queue.put((job_id, file.filename, content, jd, mode))
    return {"job_id": job_id, "message": "File uploaded and queued for streaming."}

@app.get("/stream/{job_id}")
async def stream_status(job_id: str):
    """Server-Sent Events (SSE) endpoint for real-time LangGraph execution tracking."""
    if job_id not in job_event_queues:
        return {"error": "Job ID not found or already completed."}
        
    async def event_generator():
        try:
            while True:
                event = await job_event_queues[job_id].get()
                yield f"data: {json.dumps(event)}\n\n"
                
                if event["type"] in ["completed", "error"]:
                    break
        except asyncio.CancelledError:
            print(f"Client disconnected from stream for {job_id}")
        finally:
            # Cleanup memory
            if job_id in job_event_queues:
                del job_event_queues[job_id]
                
    return StreamingResponse(event_generator(), media_type="text/event-stream")

class JDPrompt(BaseModel):
    prompt: str

@app.post("/generate-jd")
async def generate_jd(request: JDPrompt):
    """Uses the local Llama model to dynamically generate a Job Description."""
    try:
        from langchain_ollama import ChatOllama
        from langchain_core.messages import SystemMessage, HumanMessage
        
        llm = ChatOllama(model="llama3.2")
        messages = [
            SystemMessage(content="You are an expert HR Technical Recruiter. Generate a short, highly professional, bulleted Job Description (under 100 words) based on the user's prompt. Focus on the core technical requirements and responsibilities without generic boilerplate."),
            HumanMessage(content=request.prompt)
        ]
        response = llm.invoke(messages)
        return {"jd": response.content}
    except Exception as e:
        return {"error": f"Failed to generate JD: {str(e)}"}
