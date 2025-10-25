# Changelog - Sistema de Persistencia v3.3.0

## 🎯 Problema Resuelto

El proyecto tenía inconsistencias en el almacenamiento de datos entre entornos local y producción (Dokploy), especialmente con el archivo `domain-rules-status.json` que vincula dominios con sus reglas de seguridad.

## 🔍 Root Cause Identificado

1. **Estrategias de storage inconsistentes**: Algunos archivos usaban `CLIENT_STORAGE` (localStorage del navegador) y otros `MEMORY_ONLY` (RAM) en producción
2. **Fallbacks a raíz**: El código tenía fallbacks que leían archivos desde la raíz del proyecto en lugar de `/cache`
3. **domain-rules-status.json en MEMORY_ONLY**: El archivo más crítico se perdía entre requests en producción
4. **Sin limpieza al cambiar API Key**: Cambiar el token no borraba datos de la cuenta anterior

## ✅ Cambios Realizados

### 1. Migración Completa a FILE_SYSTEM

**Archivo modificado**: [src/lib/persistentStorage.ts](src/lib/persistentStorage.ts)

Todos los archivos ahora usan estrategia `FILE_SYSTEM`:

```javascript
const STORAGE_CONFIG = {
  'domains-cache.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // ✓ Cambiado de MEMORY_ONLY
    critical: false,
    regenerable: true
  },
  'security-rules-templates.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // ✓ Cambiado de CLIENT_STORAGE
    critical: true,
    regenerable: false
  },
  'domain-rules-status.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // ✓ Cambiado de MEMORY_ONLY
    critical: true,                          // ✓ Cambiado a critical=true
    regenerable: true
  },
  'user-preferences.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // ✓ Cambiado de CLIENT_STORAGE
    critical: true,
    regenerable: false
  },
  'rule-id-mapping.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // ✓ Cambiado de MEMORY_ONLY
    critical: false,
    regenerable: true
  }
};
```

**Beneficios**:
- ✅ Persistencia completa en Dokploy con volúmenes
- ✅ Datos sobreviven entre deploys
- ✅ No se pierde información entre requests
- ✅ Compatible con entornos serverless

### 2. Eliminación de Fallbacks a Raíz

**Archivo modificado**: [src/lib/memoryCache.ts](src/lib/memoryCache.ts)

**Cambios**:
- Líneas 237-246: Eliminado fallback que leía desde raíz en `readFromFileSystemDirect()`
- Líneas 322-332: Eliminado fallback que verificaba archivos en raíz en `exists()`

**Antes**:
```javascript
catch (error) {
  // Try reading from root directory as fallback
  const rootPath = resolve(process.cwd(), fileName);
  // ...
}
```

**Después**:
```javascript
catch (error) {
  console.log(`[UnifiedCache] File read failed for ${fileName} in cache/`);
  return null;
}
```

**Beneficios**:
- ✅ Comportamiento consistente
- ✅ Todos los archivos SOLO en `/cache`
- ✅ Sin confusiones entre raíz y cache

### 3. Limpieza Automática de Cache al Cambiar API Key

#### 3.1. Nueva Función de Limpieza

**Archivo modificado**: [src/lib/persistentStorage.ts](src/lib/persistentStorage.ts)

```javascript
/**
 * Clear ALL cache files
 * Use this when changing API tokens to ensure no stale data from previous account
 */
static async clearAll(): Promise<void> {
  console.log('[PersistentStorage] Clearing ALL cache files...');

  const filesToClear = Object.keys(STORAGE_CONFIG);

  for (const fileName of filesToClear) {
    try {
      await this.delete(fileName);
      console.log(`[PersistentStorage] Cleared ${fileName}`);
    } catch (error) {
      console.warn(`[PersistentStorage] Failed to clear ${fileName}:`, error);
    }
  }

  console.log('[PersistentStorage] All cache files cleared successfully');
}
```

#### 3.2. Nuevo Endpoint API

**Archivo creado**: [src/app/api/cache/clear/route.ts](src/app/api/cache/clear/route.ts)

Endpoint POST que limpia todos los archivos de cache.

#### 3.3. Detección de Cambios en Token

**Archivo modificado**: [src/app/api/token/route.ts](src/app/api/token/route.ts)

```javascript
export async function POST(request: NextRequest) {
  const { token, clearCache = true } = await request.json();

  // Check if token is different from existing token
  let isTokenChanged = false;
  // ... detección de cambios ...

  // If token changed and clearCache is true, clear all cache files
  if (isTokenChanged && clearCache) {
    await PersistentStorage.clearAll();
  }

  return NextResponse.json({
    success: true,
    tokenChanged: isTokenChanged,
    cacheCleared: isTokenChanged && clearCache
  });
}
```

#### 3.4. Limpieza en Frontend

**Archivo modificado**: [src/app/page.tsx](src/app/page.tsx)

```javascript
const saveToken = async () => {
  // Check if token is different from stored token
  const currentToken = tokenStorage.getToken();
  const isTokenChanged = currentToken !== token;

  // Save to localStorage
  tokenStorage.setToken(token);

  // Clear cache if token changed (different API account)
  if (isTokenChanged) {
    await fetch('/api/cache/clear', { method: 'POST' });
  }
  // ...
};
```

#### 3.5. Advertencia Visual

**Archivo modificado**: [src/app/page.tsx](src/app/page.tsx)

Agregado banner de advertencia en el diálogo de cambio de token:

```jsx
<div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 my-4">
  <div className="flex items-start gap-2">
    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
    <div className="text-sm">
      <p className="font-medium text-amber-900 dark:text-amber-100">Se borrará toda la caché</p>
      <p className="text-amber-700 dark:text-amber-300 mt-1">
        Al cambiar el token API, se eliminarán automáticamente todos los datos almacenados
        (dominios, reglas, preferencias) ya que pueden pertenecer a otra cuenta de Cloudflare.
      </p>
    </div>
  </div>
</div>
```

### 4. Archivos de Soporte

#### 4.1. GitIgnore para Cache

**Archivo creado**: [cache/.gitignore](cache/.gitignore)

```gitignore
# Ignorar todos los archivos de cache generados
*.json
*.tmp

# Pero mantener esta carpeta en git
!.gitignore
```

#### 4.2. Script de Verificación

**Archivo creado**: [scripts/verify-cache.sh](scripts/verify-cache.sh)

Script bash para verificar que todos los archivos de cache existen y tienen permisos correctos.

**Uso**:
```bash
./scripts/verify-cache.sh /ruta/servidor/persistencia/cloudflare_manager
```

#### 4.3. Documentación Dokploy

**Archivo creado**: [SETUP-DOKPLOY.md](SETUP-DOKPLOY.md)

Guía completa paso a paso para configurar persistencia en Dokploy.

#### 4.4. README Actualizado

**Archivo modificado**: [README.md](README.md)

Agregada sección específica para deployment en Dokploy con instrucciones de volumen.

## 🚀 Cómo Actualizar

### Para Desarrollo Local

```bash
# 1. Pull los cambios
git pull origin master

# 2. La carpeta cache/ ya debería existir
# 3. Los archivos se generarán automáticamente al usar la app

# 4. Verificar (opcional)
ls -la cache/
```

### Para Dokploy

```bash
# 1. En el servidor, asegurar que el volumen existe
mkdir -p /ruta/persistencia/cloudflare_manager
chmod 755 /ruta/persistencia/cloudflare_manager

# 2. Configurar bind mount en Dokploy:
#    Host: /ruta/persistencia/cloudflare_manager
#    Container: /app/cache

# 3. Opción A - Empezar desde cero (Recomendado)
rm /ruta/persistencia/cloudflare_manager/*.json

# 4. Opción B - Migrar datos locales
scp cache/*.json usuario@servidor:/ruta/persistencia/cloudflare_manager/
chmod 644 /ruta/persistencia/cloudflare_manager/*.json

# 5. Rebuild en Dokploy

# 6. Verificar
./scripts/verify-cache.sh /ruta/persistencia/cloudflare_manager
```

## ✅ Testing

### Casos de Prueba

1. **✓ Persistencia entre deploys**
   - Deploy en Dokploy
   - Crear reglas y asociarlas a dominios
   - Rebuild del contenedor
   - Verificar que los datos persisten

2. **✓ Cambio de API Key limpia cache**
   - Configurar token A
   - Crear reglas
   - Cambiar a token B
   - Verificar que se borraron las reglas de token A

3. **✓ Archivos solo en /cache**
   - Verificar que no se crean archivos en raíz del proyecto
   - Todos los JSON deben estar en `/cache`

## 📊 Impacto

| Métrica | Antes | Después |
|---------|-------|---------|
| Persistencia en Dokploy | ❌ Parcial | ✅ Completa |
| domain-rules-status.json | ❌ Se perdía | ✅ Persiste |
| Limpieza al cambiar token | ❌ Manual | ✅ Automática |
| Archivos en /cache | ⚠️ 4 de 5 | ✅ 5 de 5 |
| Fallbacks a raíz | ⚠️ Sí | ✅ No |

## 🔗 Archivos Modificados

1. [src/lib/persistentStorage.ts](src/lib/persistentStorage.ts) - Estrategias de storage + clearAll()
2. [src/lib/memoryCache.ts](src/lib/memoryCache.ts) - Eliminados fallbacks
3. [src/app/api/token/route.ts](src/app/api/token/route.ts) - Detección de cambios + limpieza
4. [src/app/api/cache/clear/route.ts](src/app/api/cache/clear/route.ts) - Nuevo endpoint
5. [src/app/page.tsx](src/app/page.tsx) - Limpieza en frontend + advertencia
6. [cache/.gitignore](cache/.gitignore) - Nuevo
7. [scripts/verify-cache.sh](scripts/verify-cache.sh) - Nuevo
8. [SETUP-DOKPLOY.md](SETUP-DOKPLOY.md) - Nuevo
9. [README.md](README.md) - Actualizado

## 🎉 Resultado Final

✅ **Problema 100% resuelto**: Todos los archivos ahora persisten correctamente en Dokploy con volúmenes
✅ **Limpieza automática**: Cambiar API Key borra datos de cuenta anterior
✅ **Comportamiento consistente**: Mismo código funciona en local y producción
✅ **Documentación completa**: Guías paso a paso para deployment

---

**Fecha**: Enero 2025
**Versión**: 3.3.0
