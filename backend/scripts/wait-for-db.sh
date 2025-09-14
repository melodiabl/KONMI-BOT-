#!/bin/sh
set -e
host="${DB_HOST:-db}"
port="${DB_PORT:-5432}"
until pg_isready -h "$host" -p "$port"; do
  echo "Esperando a que PostgreSQL esté listo en $host:$port..."
  sleep 2
done
echo "PostgreSQL está listo!"
