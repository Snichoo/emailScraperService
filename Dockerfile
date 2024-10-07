# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application's source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the port the app runs in
ENV PORT 8080
EXPOSE 8080

# Start the app
CMD ["node", "dist/emailScraperService.js"]
