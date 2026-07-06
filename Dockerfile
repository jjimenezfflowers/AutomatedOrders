# Dockerfile
# stage: build dependencies and compile Angular using a newer Node
FROM node:22 AS builder
WORKDIR /app

# copy package files and install
COPY package*.json ./
RUN npm ci

# build angular frontend (Node >=20.19 required)
COPY angular-frontend angular-frontend
RUN cd angular-frontend && npm ci && npm run build --prod

# copy rest of sources (tests, server, json)
COPY . .

# -------------------------------------------------
# runtime image based on Playwright so browsers are available
FROM mcr.microsoft.com/playwright:latest AS runtime
WORKDIR /app

# install packages and xvfb so headed browsers can run
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci
# ensure browsers for the installed @playwright/test version are fetched
RUN npx playwright install --with-deps

# bring the compiled frontend and other assets from builder
COPY --from=builder /app/angular-frontend/dist/angular-frontend/browser \
     ./angular-frontend/dist/angular-frontend/browser
COPY --from=builder /app/server.js ./
COPY --from=builder /app/*.json ./

# also copy playwright.config.js and tests to ensure CLI can read projects
COPY --from=builder /app/playwright.config.js ./
COPY --from=builder /app/tests ./tests

EXPOSE 3000
CMD [ "node", "server.js" ]
