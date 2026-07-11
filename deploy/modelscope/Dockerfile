FROM node:22-alpine

WORKDIR /home/user/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.mjs ./
COPY public ./public
RUN mkdir -p /home/user/app/builders && chown -R node:node /home/user/app

USER node

ENV PORT=7860 \
    PETPACK_BUILDERS_DIR=/home/user/app/builders

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=3s --start-period=8s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:7860/healthz || exit 1

CMD ["node", "app.mjs"]
