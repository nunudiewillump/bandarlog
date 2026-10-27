FROM python:3.12-slim
WORKDIR /app
ENV HOME=/tmp HF_HOME=/tmp/huggingface U2NET_HOME=/tmp/u2net HF_HUB_DISABLE_XET=1 AI_THREADS=2 MONKEY_ASSET=/app/assets/monkey.webp
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt
COPY model.py app.py icons.py ./
COPY assets/ ./assets/
USER 1000
EXPOSE 7860
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","7860","--workers","1"]
