FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Runtime configuration: config.json is rendered from environment variables at
# container start (build once, deploy anywhere). The nginx image runs every
# executable script in /docker-entrypoint.d before starting the server.
COPY config.template.json /config.template.json
COPY docker-entrypoint.d/40-render-config.sh /docker-entrypoint.d/40-render-config.sh
RUN chmod +x /docker-entrypoint.d/40-render-config.sh

COPY --from=build /app/dist/exam-studio/browser /usr/share/nginx/html

EXPOSE 80