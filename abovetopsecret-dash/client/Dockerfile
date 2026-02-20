FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/public/manifest.json /usr/share/nginx/html/manifest.json
COPY --from=builder /app/public/sw.js /usr/share/nginx/html/sw.js
COPY --from=builder /app/public/icon-192.png /usr/share/nginx/html/icon-192.png
COPY --from=builder /app/public/icon-512.png /usr/share/nginx/html/icon-512.png

# Nginx config: API reverse proxy + SPA fallback
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  location /api/ {\n\
    proxy_pass http://server:4000;\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
    proxy_set_header X-Forwarded-Proto $scheme;\n\
  }\n\
\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
