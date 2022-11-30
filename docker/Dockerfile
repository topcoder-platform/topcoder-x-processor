# Use the base image with Node.js
FROM node:8.17.0

# Copy the current directory into the Docker image
COPY . /topcoder-x-processor

# Set working directory for future use
WORKDIR /topcoder-x-processor

# Install the dependencies from package.json
RUN npm install
#RUN npm run build
#RUN npm run test

CMD npm start