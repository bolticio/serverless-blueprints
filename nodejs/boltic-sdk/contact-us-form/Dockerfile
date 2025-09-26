### SYSTEM GENERATED FILE, MAKE CHANGES AS NEEDED ###

# Use a specific version as the base image for the builder stage
FROM node:20-alpine AS builder
# FROM busybox:latest AS busybox

# Set /serverless as the working directory in the builder stage
WORKDIR /serverless

### UNCOMMENT AS NEEDED ###
# Copy package.json and package-lock.json into the builder stage
# This allows the dependencies to be installed before copying the rest of the application code
COPY package*.json ./

### UNCOMMENT AS NEEDED ###
# Install the listed packages from package.json and package-lock.json
# RUN npm ci --omit=dev

### DEFAULT BOOTSTRAP BUILD CODE, RUN LOCALLY TO GENERATE package.json ###
# If package.json exists and not empty, install the listed packages
# If it doesn't exist or is empty, print a message and skip the installation
RUN if [ -s package.json ]; then \
        npm install; \
    else \
        echo "No package.json found, continuing with default settings"; \
        npm init --yes; npm pkg set type="module"; npm pkg set main="handler.js"; \
    fi

### INSTALL SYSTEM DEPENDENCIES ###
RUN npm install --no-save \
    express \
    body-parser \
    axios \
    winston \
    lodash

# Create a backup of package.json and package-lock.json if they exist so that they can be restored later
RUN if [ -f package.json ]; then cp package.json package.json.bak; fi && \
    if [ -f package-lock.json ]; then cp package-lock.json package-lock.json.bak; fi

# Copy the rest of the application code into the builder stage
COPY . /serverless

# Restore the backup of package.json and package-lock.json if they exist
RUN if [ -f package.json.bak ]; then cp package.json.bak package.json && rm package.json.bak; fi && \
    if [ -f package-lock.json.bak ]; then cp package-lock.json.bak package-lock.json && rm package-lock.json.bak; fi

# Start a new stage with a distroless image for smaller image size and improved security
FROM gcr.io/distroless/nodejs20-debian11

# Copy the /serverless directory from the builder stage into the current stage
# This includes the application code and the dependencies
COPY --from=builder /serverless /serverless

# Adding required linux utilities
COPY --from=busybox:latest /bin/cp /bin/cp

# Set /serverless as the working directory in the current stage
WORKDIR /serverless

EXPOSE 8080
EXPOSE 3000

# Set the command to run when the container starts
# This will start the application by running index file
CMD [ "handler.js" ]
