FROM node:20-alpine

# Use an unprivileged user
USER node

# Set working directory
WORKDIR /app

# Copy package files (with correct permissions)
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY --chown=node:node . .

# Expose the API and dev server port
EXPOSE 8888

# Default command
CMD ["npm", "run", "dev"]
