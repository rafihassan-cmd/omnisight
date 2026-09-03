from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional

router = APIRouter()

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    task: str = Form(...)
):
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "task_received": task,
        "status": "success"
    }