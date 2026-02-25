FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm i
COPY . .
EXPOSE 8081
CMD ["npm","run","dev"]
