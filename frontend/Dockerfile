FROM node:22-alpine

# CA bundle: next/image fetches PL CDN images over HTTPS server-side
RUN apk add --no-cache ca-certificates

WORKDIR /srv

# NEXT_PUBLIC_* is inlined at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
