# Use the official Playwright base image as the builder stage
FROM mcr.microsoft.com/playwright:v1.51.1-jammy AS builder

# Install essential build tools and dependencies required for native modules and general tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    git \
    libc-dev \
    openssh-client \
    make \
    g++

# Create and set working directory for the application
RUN mkdir /lighthouse-report
WORKDIR /lighthouse-report

# Copy package definition files for dependency installation
COPY ./package.json .

# Install dependencies
RUN npm install

# Copy the rest of the application code into the image
COPY . .

# ----------------------------------------

# Create a second stage using the same base image to keep the final image slim
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

# Create and set the working directory
RUN mkdir /lighthouse-report
WORKDIR /lighthouse-report

# Copy the application code and installed node_modules from the builder stage
COPY --from=builder /lighthouse-report .

# Install required Playwright browsers (like Chromium)
RUN npx playwright install

# Set the default entry point for the container
ENTRYPOINT ["node", "handler.js"]
