FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/
COPY gateway.example.yaml ./

ENV MCP_GATEWAY_PORT=3100
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3100/api/health || exit 1

CMD ["node", "dist/serve.js"]
