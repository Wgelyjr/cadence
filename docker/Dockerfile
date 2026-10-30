# BabyApp web — multi-stage build: Vite/React build, served by nginx.
#
# The Supabase URL + anon key are baked into the bundle at build time (Vite
# VITE_* variables). Change them and rebuild:
#   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... docker compose up -d --build web

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
