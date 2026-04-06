FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY app.js ./
COPY index.html ./
COPY styles.css ./
COPY README.md ./
COPY datasets ./datasets
COPY data ./data

ENV NODE_ENV=production
ENV PORT=8788

EXPOSE 8788

CMD ["node", "server.mjs"]
