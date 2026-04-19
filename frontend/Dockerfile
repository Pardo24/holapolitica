FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better caching).
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the project.
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
