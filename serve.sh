#!/bin/bash
PORT=9999
echo "========================================="
echo "  🚀 Levantando servidor local Infonite "
echo "  ⚡ Hot-Reload activado (live-server)"
echo "  Abre: http://localhost:$PORT"
echo "  Presiona Ctrl+C para detener"
echo "========================================="

# Usamos npx con live-server que inyecta websockets para recargar el navegador al guardar
npx -y live-server ./ --port=$PORT --no-browser --cors --quiet
