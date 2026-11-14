FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY admin ./admin
COPY web ./web
ENV DATA_DIR=/data PORT=8080 NODE_NO_WARNINGS=1
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server.js"]
