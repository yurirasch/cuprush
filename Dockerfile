FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY index.html server.js tiny-ws.js ./
EXPOSE 3000
ENV PORT=3000
CMD ["node","server.js"]
