# Use the base image with Node.js
FROM node:20

WORKDIR /topcoder-x-processor
COPY package.json package-lock.json ./
RUN npm ci --silent --legacy-peer-deps
COPY . .

CMD npm start
