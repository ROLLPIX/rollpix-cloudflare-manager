#!/bin/bash
# Script de verificación de archivos de cache para Dokploy
# Uso: ./scripts/verify-cache.sh [ruta_al_volumen]

CACHE_DIR="${1:-/app/cache}"
REQUIRED_FILES=(
  "domains-cache.json"
  "security-rules-templates.json"
  "domain-rules-status.json"
  "user-preferences.json"
  "rule-id-mapping.json"
)

echo "🔍 Verificando archivos de cache en: $CACHE_DIR"
echo "================================================"

# Verificar que la carpeta existe
if [ ! -d "$CACHE_DIR" ]; then
  echo "❌ ERROR: La carpeta $CACHE_DIR no existe"
  echo "   Creando carpeta..."
  mkdir -p "$CACHE_DIR"
  chmod 755 "$CACHE_DIR"
  echo "   ✅ Carpeta creada"
fi

# Verificar permisos de la carpeta
FOLDER_PERMS=$(stat -c "%a" "$CACHE_DIR" 2>/dev/null || stat -f "%Lp" "$CACHE_DIR" 2>/dev/null)
echo ""
echo "📁 Carpeta: $CACHE_DIR"
echo "   Permisos: $FOLDER_PERMS"

if [ "$FOLDER_PERMS" != "755" ] && [ "$FOLDER_PERMS" != "775" ]; then
  echo "   ⚠️  Permisos recomendados: 755"
  read -p "   ¿Corregir permisos? (s/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Ss]$ ]]; then
    chmod 755 "$CACHE_DIR"
    echo "   ✅ Permisos corregidos a 755"
  fi
fi

# Verificar cada archivo
echo ""
echo "📄 Archivos requeridos:"
echo "================================================"

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
  FILEPATH="$CACHE_DIR/$file"

  if [ -f "$FILEPATH" ]; then
    FILE_SIZE=$(stat -c%s "$FILEPATH" 2>/dev/null || stat -f%z "$FILEPATH" 2>/dev/null)
    FILE_PERMS=$(stat -c "%a" "$FILEPATH" 2>/dev/null || stat -f "%Lp" "$FILEPATH" 2>/dev/null)

    echo "✅ $file"
    echo "   Tamaño: $FILE_SIZE bytes"
    echo "   Permisos: $FILE_PERMS"

    # Verificar que no esté vacío
    if [ "$FILE_SIZE" -lt 10 ]; then
      echo "   ⚠️  ADVERTENCIA: Archivo muy pequeño, posiblemente corrupto"
    fi

    # Verificar permisos
    if [ "$FILE_PERMS" != "644" ] && [ "$FILE_PERMS" != "664" ]; then
      echo "   ⚠️  Permisos recomendados: 644"
    fi

  else
    echo "❌ $file (NO EXISTE)"
    MISSING_FILES+=("$file")
  fi
  echo ""
done

# Resumen
echo "================================================"
echo "📊 Resumen"
echo "================================================"
echo "Total archivos requeridos: ${#REQUIRED_FILES[@]}"
echo "Archivos encontrados: $((${#REQUIRED_FILES[@]} - ${#MISSING_FILES[@]}))"
echo "Archivos faltantes: ${#MISSING_FILES[@]}"

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
  echo ""
  echo "✅ ¡Todos los archivos están presentes!"
  echo ""
  echo "📝 Notas:"
  echo "   - Si los dominios aún no muestran reglas correctamente,"
  echo "     prueba hacer 'Actualizar Todo' en la interfaz"
  echo "   - Verifica que el volumen esté correctamente montado en Dokploy"
  echo "   - La ruta del contenedor debe ser: /app/cache"
else
  echo ""
  echo "⚠️  Archivos faltantes:"
  for file in "${MISSING_FILES[@]}"; do
    echo "   - $file"
  done
  echo ""
  echo "💡 Solución:"
  echo "   1. Accede a la aplicación y haz 'Actualizar Todo'"
  echo "   2. Esto generará los archivos faltantes automáticamente"
  echo "   3. Si el problema persiste, verifica el volumen en Dokploy"
fi

# Verificar archivos huérfanos (archivos antiguos que ya no se usan)
echo ""
echo "🔍 Buscando archivos huérfanos..."
ORPHAN_COUNT=0
for file in "$CACHE_DIR"/*.json; do
  if [ -f "$file" ]; then
    BASENAME=$(basename "$file")

    # Verificar si está en la lista de archivos requeridos
    IS_REQUIRED=false
    for required in "${REQUIRED_FILES[@]}"; do
      if [ "$BASENAME" == "$required" ]; then
        IS_REQUIRED=true
        break
      fi
    done

    if [ "$IS_REQUIRED" = false ]; then
      echo "   ⚠️  $BASENAME (archivo huérfano, puede eliminarse)"
      ((ORPHAN_COUNT++))
    fi
  fi
done

if [ $ORPHAN_COUNT -eq 0 ]; then
  echo "   ✅ No hay archivos huérfanos"
fi

echo ""
echo "================================================"
echo "✅ Verificación completa"
echo "================================================"
