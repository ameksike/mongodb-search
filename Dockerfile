# Build and run the agent (web + watch). Use same image; override command in compose.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Default: run web server (overridden by docker-compose for watch)
CMD ["npm", "run", "agent:start"]
