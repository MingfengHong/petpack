FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app.mjs ./
COPY public ./public
RUN mkdir -p /app/builders && chown -R node:node /app
USER node
ENV PORT=8080 PETPACK_BUILDERS_DIR=/app/builders
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "app.mjs"]
