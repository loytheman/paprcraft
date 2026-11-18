# PDF converter Lambda image: LibreOffice Writer + metric-compatible fonts + the Lambda runtime
# interface client. Build context is backend/lambda (see infra/30-pdf-convert.sh).
FROM node:22-bookworm-slim AS ric
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake autoconf automake libtool python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /ric
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund aws-lambda-ric@3

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer-nogui fontconfig \
    fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation fonts-dejavu-core fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /var/task
COPY --from=ric /ric /opt/ric
COPY pdf/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY pdfConvert.js exportEntry.js ./
ENV HOME=/tmp
ENV LAMBDA_TASK_ROOT=/var/task
ENTRYPOINT ["/opt/ric/node_modules/.bin/aws-lambda-ric"]
CMD ["pdfConvert.handler"]
