FROM python:3.12-alpine

LABEL description="Bank Statement PDF → JSON Query Tool"

# pdfplumber pulls in Pillow which needs these on Alpine
RUN apk add --no-cache \
    gcc \
    musl-dev \
    zlib-dev \
    jpeg-dev \
    libffi-dev

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY parse.py       .
COPY serve.py       .
COPY index.html     ./www/index.html
COPY alasql.min.js  ./www/alasql.min.js

RUN mkdir -p /data/statements

EXPOSE 8080

ENTRYPOINT ["python", "serve.py"]
CMD ["serve"]
