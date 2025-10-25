# 🚀 Guía de Deploy en Dokploy - ROLLPIX Cloudflare Manager

## 📋 Información del Entorno

- **VPS**: vps1.rollpix.com
- **Dokploy URL**: https://vps1.rollpix.com (o puerto específico)
- **Proyecto**: CloudflareManager
- **Servidor**: CloudflareManager
- **Repositorio**: https://github.com/ROLLPIX/rollpix-cloudflare-manager

---

## 🔧 Paso 1: Acceder a Dokploy

1. Abre tu navegador y ve a la URL de Dokploy:
   ```
   https://vps1.rollpix.com
   ```

2. Inicia sesión con tus credenciales

3. Navega a tu proyecto **CloudflareManager**

---

## 📦 Paso 2: Configurar la Aplicación

### Opción A: Si es una Nueva Aplicación

1. **Crear nueva aplicación** dentro del servidor CloudflareManager:
   - Haz clic en "Create Application" o "Nueva Aplicación"
   - Selecciona **"GitHub"** como fuente

2. **Configuración del Repositorio**:
   - **Repository URL**: `https://github.com/ROLLPIX/rollpix-cloudflare-manager`
   - **Branch**: `master`
   - **Auto Deploy**: ✅ Activar (deploy automático en cada push)

3. **Build Settings**:
   - **Framework**: `Next.js`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm ci` (recomendado) o `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: `20.15.1` o `20.x`
   - **Port**: `3000` (puerto interno de Next.js)

### Opción B: Si Ya Existe la Aplicación

1. Ve a la aplicación existente en CloudflareManager
2. Haz clic en **"Settings"** o **"Configuración"**
3. Verifica/actualiza los siguientes campos:
   - **Repository**: `https://github.com/ROLLPIX/rollpix-cloudflare-manager`
   - **Branch**: `master`

---

## 🔐 Paso 3: Variables de Entorno (Recomendado)

### ✅ Configurar Token de Cloudflare Automático

**NUEVO en v2.4.2**: La aplicación ahora detecta automáticamente el token desde variables de entorno.

1. Ve a la sección **"Environment Variables"** o **"Variables de Entorno"**

2. Agrega la siguiente variable:
   ```
   Key: CLOUDFLARE_API_TOKEN
   Value: tu_token_de_cloudflare_aqui
   ```

3. **Comportamiento automático**:
   - ✅ Si `CLOUDFLARE_API_TOKEN` está configurado → Se carga automáticamente al iniciar
   - ✅ El token se almacena en localStorage del navegador para acceso rápido
   - ✅ Muestra un mensaje verde indicando que se detectó el token de entorno
   - ✅ Los usuarios pueden cambiar el token en cualquier momento desde la UI

4. **Si NO configuras la variable de entorno**:
   - ℹ️ Los usuarios deberán ingresar su token manualmente en la UI
   - ℹ️ El token se guardará en localStorage del navegador (7 días de expiración)
   - ℹ️ Cada usuario puede usar su propio token personal

### 🔒 Seguridad del Token

**Importante**: El token configurado en variables de entorno se usa SOLO para cargar automáticamente en el navegador. No se expone en el frontend ni en logs públicos.

- **Endpoint de seguridad**: `/api/env-token` (GET solo muestra token enmascarado)
- **Carga del token**: Solo disponible vía POST con validación server-side
- **Almacenamiento**: localStorage del navegador (client-side)

---

## 🌐 Paso 4: Configurar Dominio

### Opción 1: Usar Subdominio de Rollpix

1. En la configuración de la aplicación, ve a **"Domains"** o **"Dominios"**

2. Configura el dominio:
   ```
   cf.rollpix.com
   ```
   o el subdominio que prefieras.

3. **Configurar DNS en Cloudflare**:
   - Ve a tu panel de Cloudflare para `rollpix.com`
   - Crea un registro tipo **A** o **CNAME**:
     ```
     Tipo: A (o CNAME)
     Nombre: cf
     Valor: IP de vps1.rollpix.com (ej: 123.456.789.10)
     Proxy: Activado (naranja) o Desactivado (gris) según prefieras
     ```

4. **SSL/TLS**: Dokploy debería configurar automáticamente Let's Encrypt

### Opción 2: Acceder por IP directa

Si prefieres acceder sin dominio personalizado:
```
http://vps1.rollpix.com:PORT_ASIGNADO
```
(Dokploy asignará un puerto automáticamente)

---

## 🚀 Paso 5: Deploy Inicial

1. **Hacer el primer deploy**:
   - Haz clic en **"Deploy"** o **"Desplegar"**
   - Dokploy comenzará a:
     - ✅ Clonar el repositorio
     - ✅ Instalar dependencias (`npm ci`)
     - ✅ Ejecutar build (`npm run build`)
     - ✅ Iniciar la aplicación (`npm start`)

2. **Monitorear el progreso**:
   - Ve a la pestaña **"Logs"** o **"Registros"**
   - Deberías ver algo como:
     ```
     Cloning repository...
     Installing dependencies...
     Building Next.js application...
     ✓ Compiled successfully
     Starting production server...
     ✓ Ready on http://0.0.0.0:3000
     ```

3. **Tiempo estimado**: 3-5 minutos (dependiendo del VPS)

---

## ✅ Paso 6: Verificar el Deploy

1. **Accede a la URL configurada**:
   ```
   https://cf.rollpix.com
   ```
   (o la URL que hayas configurado)

2. **Verificar que funcione**:
   - ✅ Deberías ver la pantalla de configuración de token
   - ✅ Ingresa un token de Cloudflare válido
   - ✅ Verifica que cargue la lista de dominios
   - ✅ Prueba el refresh individual de un dominio
   - ✅ Navega entre "Gestión de Dominios" y "Reglas de Seguridad"
   - ✅ Confirma que no se pierden dominios del cache

---

## 🔄 Paso 7: Configurar Auto-Deploy (Recomendado)

Si activaste "Auto Deploy" en el Paso 2:

1. **Cada vez que hagas push a `master`**:
   ```bash
   git push origin master
   ```

2. **Dokploy automáticamente**:
   - Detecta el nuevo commit
   - Hace pull del código actualizado
   - Re-ejecuta el build
   - Reinicia la aplicación
   - ✅ Deploy completo en ~3-5 minutos

3. **Monitorear deploys**:
   - Ve a la pestaña **"Deployments"** para ver historial
   - Cada deploy mostrará el commit hash y estado

---

## 🐛 Troubleshooting

### Build Falla con Error de Memoria

Si el build falla por falta de memoria:

**Solución**: Aumentar memoria de Node.js

1. En Dokploy, modifica el **Build Command**:
   ```
   NODE_OPTIONS="--max-old-space-size=4096" npm run build
   ```

### Puerto 3000 Ya en Uso

Si ves error "Port 3000 is already in use":

**Solución**: Dokploy asigna puertos automáticamente

1. Deja el **Start Command** como:
   ```
   npm start
   ```
2. Dokploy mapeará el puerto 3000 interno a un puerto externo disponible

### Permisos de Cache

Si hay errores de escritura en archivos de cache:

**Solución**: Los archivos cache se crean automáticamente

1. No necesitas hacer nada, Next.js crea los archivos en runtime
2. Si persiste el error, verifica que el directorio tenga permisos:
   ```bash
   # Solo si tienes acceso SSH al VPS
   chmod -R 755 /path/to/app/cache
   ```

### Variables de Entorno No Funcionan

Si el `CLOUDFLARE_API_TOKEN` no se carga:

**Solución**: Reiniciar la aplicación después de agregar variables

1. Ve a la aplicación en Dokploy
2. Haz clic en **"Restart"** o **"Reiniciar"**
3. Las nuevas variables de entorno se cargarán

---

## 📊 Configuración Recomendada Final

```yaml
# Resumen de configuración para Dokploy

Application Name: rollpix-cloudflare-manager
Repository: https://github.com/ROLLPIX/rollpix-cloudflare-manager
Branch: master
Framework: Next.js

Build Settings:
  Install Command: npm ci
  Build Command: npm run build
  Start Command: npm start
  Node Version: 20.x

Environment Variables:
  CLOUDFLARE_API_TOKEN: [OPCIONAL - tu token aquí]
  NODE_ENV: production

Domain:
  Primary: cf.rollpix.com
  SSL/TLS: Let's Encrypt (auto)

Resources:
  Memory: 2GB (recomendado)
  CPU: 2 cores (recomendado)

Auto Deploy: Enabled
Health Check: Enabled
Port: 3000 (interno)
```

---

## 🎯 Checklist de Deploy Exitoso

Antes de considerar el deploy completo, verifica:

- [ ] La aplicación se construye sin errores (`npm run build` exitoso)
- [ ] El servidor inicia correctamente (`npm start` sin crashes)
- [ ] La URL configurada es accesible públicamente
- [ ] SSL/TLS está configurado y funcionando (HTTPS)
- [ ] Puedes ingresar un token de Cloudflare y ver dominios
- [ ] Refresh individual NO borra el cache (fix v2.4.1 funcionando)
- [ ] Navegación entre tabs preserva todos los dominios
- [ ] Auto-deploy funciona al hacer push a GitHub
- [ ] Los logs de Dokploy no muestran errores críticos

---

## 📝 Notas Importantes

### Archivos de Cache

Los siguientes archivos se crean automáticamente en runtime:
- `cache/domains-cache.json`
- `cache/security-rules-templates.json`
- `cache/rule-id-mapping.json`
- `user-preferences.json`

**NO** necesitas crearlos manualmente. Next.js los generará al iniciar.

### Persistencia de Datos

Si necesitas persistencia entre deploys:

1. **Opción 1 - Volume Mount** (recomendado):
   - En Dokploy, configura un volumen persistente
   - Monta el directorio `cache/` a un volumen
   - Los datos sobrevivirán a los re-deploys

2. **Opción 2 - Base de Datos**:
   - Para futuras versiones, migrar de JSON a PostgreSQL/SQLite
   - Ver roadmap en CLAUDE.md

### Monitoreo

Para monitorear la aplicación en producción:

1. **Logs en tiempo real**:
   - Dokploy → Tu Aplicación → Logs
   - Filtra por tipo: Todos / Errores / Warnings

2. **Métricas**:
   - Dokploy debería mostrar uso de CPU, RAM, y red

3. **Health Checks**:
   - Configura un health check endpoint si Dokploy lo soporta
   - Endpoint sugerido: `/api/test-token` (ya existe)

---

## 🆘 Soporte

Si encuentras problemas durante el deploy:

1. **Revisa los logs** en Dokploy (pestaña Logs)
2. **Verifica el build local**:
   ```bash
   npm run build
   npm start
   ```
3. **Compara con commit anterior** que funcionaba:
   ```bash
   git log --oneline
   git checkout COMMIT_HASH_ANTERIOR
   ```

4. **Contacta al equipo** con:
   - Logs completos del error
   - Commit hash donde falla
   - Variables de entorno configuradas (sin valores sensibles)

---

**Desarrollado con ❤️ por Nicolás Marquevich con ayuda de Claude Code**

✅ **Versión actual**: v2.4.1
🔧 **Último fix**: Cache corruption en refresh individual resuelto
🚀 **Estado**: Listo para producción
