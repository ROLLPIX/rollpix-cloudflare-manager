# Configuración de Persistencia en Dokploy

## 🎯 Problema Resuelto

Este proyecto requiere persistencia de archivos JSON entre deploys. Los archivos se almacenan en la carpeta `/app/cache` del contenedor.

**ACTUALIZACIÓN v3.3.0**: Todos los archivos ahora usan estrategia FILE_SYSTEM para garantizar persistencia completa en producción con volúmenes Docker.

## 📂 Archivos que Requieren Persistencia

| Archivo | Crítico | Descripción |
|---------|---------|-------------|
| `domains-cache.json` | No | Cache de dominios (se regenera desde Cloudflare) |
| `security-rules-templates.json` | **SÍ** | Plantillas de reglas creadas por el usuario |
| `domain-rules-status.json` | **SÍ** | Relación dominio↔reglas (IMPORTANTE) |
| `user-preferences.json` | **SÍ** | Preferencias del usuario |
| `rule-id-mapping.json` | No | Mapeo de IDs (se regenera) |

## 🔧 Configuración del Volumen en Dokploy

### 1. Crear carpeta de persistencia en el servidor

```bash
mkdir -p /ruta/servidor/persistencia/cloudflare_manager
chmod 755 /ruta/servidor/persistencia/cloudflare_manager
```

### 2. Configurar bind mount en Dokploy

En la configuración del proyecto en Dokploy, agregar el siguiente volumen:

```
Host Path: /ruta/servidor/persistencia/cloudflare_manager
Container Path: /app/cache
```

### 3. Migrar archivos existentes (opcional)

Si ya tienes datos en tu entorno local, cópialos al servidor:

```bash
# Desde tu máquina local
scp cache/*.json usuario@servidor:/ruta/servidor/persistencia/cloudflare_manager/

# En el servidor, ajustar permisos
chmod 644 /ruta/servidor/persistencia/cloudflare_manager/*.json
```

### 4. Rebuild del proyecto

Después de configurar el volumen, hacer rebuild del proyecto en Dokploy para que reconozca el nuevo mount point.

## ✅ Verificación

Después del deploy, verificar que los archivos se están creando en la carpeta del servidor:

```bash
ls -la /ruta/servidor/persistencia/cloudflare_manager/
```

Deberías ver los 5 archivos JSON listados arriba.

## 🔍 Troubleshooting

### Problema: Las reglas de dominios se resetean

**Causa**: El archivo `domain-rules-status.json` no existe o no tiene persistencia.

**Solución**:
1. Verificar que el volumen esté correctamente montado
2. Verificar permisos de la carpeta (644 para archivos, 755 para carpetas)
3. Si copias archivos manualmente, asegúrate de copiar TODOS los JSON, especialmente `domain-rules-status.json`

### Problema: Los dominios muestran IDs de reglas incorrectos

**Causa**: Estás usando archivos de diferentes entornos (local vs producción) o falta algún archivo JSON.

**Solución**:
1. Eliminar TODOS los archivos JSON del volumen
2. Dejar que la aplicación los regenere desde cero
3. Hacer "Actualizar Todo" en la interfaz para sincronizar

### Problema: Permisos denegados

**Causa**: El contenedor no tiene permisos para escribir en el volumen.

**Solución**:
```bash
# En el servidor
sudo chown -R 1000:1000 /ruta/servidor/persistencia/cloudflare_manager
chmod -R 755 /ruta/servidor/persistencia/cloudflare_manager
```

## 📝 Notas Importantes

- **NO copiar archivos manualmente** entre entornos a menos que estés seguro de que son compatibles
- **SIEMPRE hacer backup** de los archivos JSON críticos antes de actualizaciones
- El archivo `domain-rules-status.json` es el MÁS IMPORTANTE - sin él, los dominios no mostrarán las reglas correctamente
- Si migras datos de local a producción, verifica que los IDs de reglas coincidan
- **Al cambiar el API Key**: Se borrará automáticamente toda la caché para evitar mostrar datos de otra cuenta

## 🚀 Proceso Recomendado de Deploy

1. Configurar volumen en Dokploy (solo primera vez)
2. Deploy del código
3. Dejar que la aplicación genere los archivos por primera vez
4. Configurar tus plantillas de reglas
5. Hacer backup de los archivos JSON generados
6. En futuros deploys, los archivos se mantendrán automáticamente

---

**Última actualización**: Enero 2025
**Versión de la app**: 3.2.0
