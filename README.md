# ROLLPIX Cloudflare Manager

![Rollpix Logo](public/logo-rollpix.png)

Una aplicación web moderna para gestionar visualmente dominios en Cloudflare con **sistema completo de reglas de seguridad**. Desarrollada con Next.js 15 y diseñada específicamente para equipos que necesitan monitorear y controlar múltiples dominios de forma eficiente, incluyendo gestión avanzada de reglas de firewall.

## 🚀 Características Principales

### Gestión Visual de Dominios
- **Indicadores visuales intuitivos**: Iconos de escudo corregidos (Shield para proxy activo, ShieldOff para DNS-only)
- **Vista de tabla optimizada**: Información clara con dominio, tipo de registro, estado actual y acciones
- **Columna de reglas avanzada**: Pills con IDs de reglas de plantilla + contador de reglas personalizadas

### Sistema de Reglas de Seguridad 🔥 **NUEVO**
- **Gestión de plantillas**: Crear, editar y versionar reglas de firewall corporativas
- **Aplicación masiva**: Aplicar/remover reglas en múltiples dominios simultáneamente
- **Detección de conflictos**: Análisis automático de reglas obsoletas o conflictivas
- **Modal de reglas por dominio**: Ver y gestionar reglas individualmente con detalle completo
- **Actualización inteligente**: Botón para actualizar reglas a nuevas versiones en todos los dominios

### Control de Proxy Avanzado
- **Toggle individual**: Habilitar/deshabilitar proxy para dominios específicos con un clic
- **Acciones masivas**: Selección múltiple para operaciones en lote con progreso visual
- **Actualización unificada**: Botón único con checkboxes para DNS, Firewall y Reglas
- **Confirmaciones**: Modal de confirmación para cambio de token API con botón cancelar

### Sistema de Persistencia Inteligente
- **Cache JSON local**: Evita límites de rate limiting de la API de Cloudflare
- **Preferencias de usuario**: Persistencia de configuraciones (items por página, ordenamiento, filtros)
- **Token API seguro**: Almacenamiento automático en variables de entorno con validación completa

### Funcionalidades de Productividad
- **Ordenamiento inteligente**: Por nombre o estado con priorización automática
- **Filtrado avanzado**: Ver todos, solo proxied, o solo not-proxied
- **Búsqueda en tiempo real**: Filtrado instantáneo por nombre de dominio
- **Paginación configurable**: 12, 24, 48 o 96 dominios por página
- **Progreso visual**: Indicadores de progreso para operaciones largas

## 🛠 Tecnologías Utilizadas

### Frontend
- **Next.js 15.5.3** - App Router con Turbopack para desarrollo rápido
- **React 19.1.0** - React Server Components y Concurrent Features
- **TypeScript 5.x** - Tipado fuerte para mayor seguridad y productividad
- **shadcn/ui** - Componentes UI modernos y accesibles basados en Radix UI
- **Tailwind CSS 4.x** - Estilizado utilitario y responsive con nueva arquitectura
- **Lucide React 0.543.0** - Iconografía consistente y profesional

### Backend y APIs
- **Next.js API Routes** - Endpoints serverless para manejo de datos
- **Cloudflare API v4** - Integración completa con servicios de Cloudflare (DNS + Rulesets)
- **JSON File System** - Persistencia local para cache y preferencias

### Dependencias Principales
```json
{
  "next": "15.5.3",
  "react": "19.1.0",
  "react-dom": "19.1.0",
  "typescript": "^5",
  "tailwindcss": "^4",
  "lucide-react": "^0.543.0",
  "sonner": "^2.0.7",
  "uuid": "^13.0.0"
}
```

### Radix UI Components
```json
{
  "@radix-ui/react-checkbox": "^1.3.3",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-label": "^2.1.7",
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-tooltip": "^1.2.8"
}
```

### Herramientas de Desarrollo
- **Playwright 1.55.0** - Testing end-to-end automatizado
- **ESLint 9.x** - Linting y calidad de código
- **Sonner** - Notificaciones toast elegantes

## 📋 Requisitos del Sistema

### Versiones Específicas Requeridas ⚠️
- **Node.js**: `20.15.1` (recomendado) o superior a `20.x`
- **npm**: `10.7.0` o superior
- **Token API de Cloudflare**: Con permisos específicos (ver configuración)

### Permisos de Token API Cloudflare
```
Zone Settings: Read
DNS: Edit  
Zone: Read
Zone Firewall Access Rules: Edit  
Account Firewall Access Rules: Read
Zone WAF: Edit
```

### Compatibilidad de Sistema Operativo
- **Windows**: ✅ Probado en Windows 10/11
- **macOS**: ✅ Compatible 
- **Linux**: ✅ Compatible

## 🔧 Instalación y Configuración

### Pasos de Instalación Completos

#### 1. Verificar Requisitos del Sistema
```bash
# Verificar versión de Node.js
node --version  # Debe ser >= 20.15.1

# Verificar versión de npm
npm --version   # Debe ser >= 10.7.0
```

#### 2. Clonar el repositorio
```bash
git clone https://github.com/ROLLPIX/rollpix-cloudflare-manager.git
cd rollpix-cloudflare-manager
```

#### 3. Instalar dependencias exactas
```bash
# Usar npm ci para instalación exacta desde package-lock.json
npm ci

# O instalar con npm install si prefieres actualizar dependencias
npm install
```

#### 4. Configurar variables de entorno (Opcional)
```bash
# Crear archivo de entorno si quieres token predeterminado
echo "CLOUDFLARE_API_TOKEN=tu_token_aqui" > .env.local
```

#### 5. Ejecutar en desarrollo
```bash
# Modo desarrollo con Turbopack
npm run dev

# O modo desarrollo estándar (si Turbopack da problemas)
next dev
```

#### 6. Verificar instalación
- Navega a `http://localhost:3001` (o el puerto que se muestre)
- Deberías ver la pantalla de configuración de token API
- Ingresa tu token de Cloudflare para empezar

### ⚠️ Solución de Problemas de Instalación

#### Error de incompatibilidad de dependencias
```bash
# Limpiar cache de npm y reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### Problemas con React 19/Next.js 15
```bash
# Si tienes conflictos, usa estas versiones específicas
npm install react@19.1.0 react-dom@19.1.0 next@15.5.3
```

#### Problemas con Tailwind CSS 4
```bash
# Si Tailwind CSS 4 causa problemas, usa la v3
npm install tailwindcss@^3.4.0 @tailwindcss/postcss@^3
```

#### Error con shadcn/ui components
```bash
# Reinstalar componentes UI si es necesario
npx shadcn@latest add dialog
npx shadcn@latest add popover
npx shadcn@latest add tabs
# ... otros componentes según sea necesario
```

## 🔑 Configuración del Token API

### Obtener Token de Cloudflare
1. Accede a [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Crea un token personalizado con los siguientes permisos:
   - **Zone Settings: Read**
   - **DNS: Edit**  
   - **Zone: Read**
   - **Zone Firewall Access Rules: Edit**  
   - **Account Firewall Access Rules: Read**
   - **Zone WAF: Edit**
3. Incluye todas las zonas que deseas gestionar
4. Guarda el token de forma segura (solo se muestra una vez)

### Configuración en la Aplicación
- Al iniciar la aplicación por primera vez, ingresa tu token API
- El token se almacena automáticamente en `.env.local`
- Para cambiar el token, usa el botón "Cambiar Token API"

## 🏗 Arquitectura del Sistema

### Flujo de Datos
```
[Cloudflare API] ↔ [Cache JSON] ↔ [Next.js API Routes] ↔ [React Components]
                                           ↕
                                  [User Preferences]
```

### Sistema de Cache Inteligente
- **Primera carga**: Obtiene datos desde Cloudflare API con paginación automática
- **Navegación**: Utiliza cache local para respuesta instantánea
- **Refresh manual**: Actualiza cache completo desde API
- **Updates selectivos**: Refresca solo dominios modificados tras cambios de proxy

### Gestión de Rate Limiting
- **Cache persistente**: Evita llamadas innecesarias a la API
- **Paginación automática**: Maneja límites de 100 dominios por request
- **Actualización inteligente**: Solo refresca datos cuando es necesario

## 📁 Estructura del Proyecto

```
rollpix-cloudflare-manager/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cache/route.ts                    # Gestión de cache JSON
│   │   │   ├── domains/
│   │   │   │   ├── route.ts                     # Fetch de dominios con paginación
│   │   │   │   ├── enrich/route.ts              # Enriquecimiento con reglas de seguridad
│   │   │   │   └── rules/
│   │   │   │       ├── [zoneId]/route.ts        # Reglas específicas por zona
│   │   │   │       ├── bulk-action/route.ts     # Acciones masivas de reglas
│   │   │   │       ├── clean/route.ts           # Limpieza de reglas
│   │   │   │       └── custom/[ruleId]/route.ts # Gestión reglas personalizadas
│   │   │   ├── preferences/route.ts             # Persistencia de preferencias
│   │   │   ├── proxy-toggle/route.ts            # Toggle de estado proxy
│   │   │   ├── security-rules/
│   │   │   │   ├── route.ts                     # CRUD plantillas de reglas
│   │   │   │   ├── [id]/route.ts                # Gestión individual de plantillas
│   │   │   │   ├── analyze/route.ts             # Análisis de reglas por dominio
│   │   │   │   ├── apply/route.ts               # Aplicación de reglas
│   │   │   │   └── init-examples/route.ts       # Inicialización con ejemplos
│   │   │   ├── test-token/route.ts              # Validación completa de token
│   │   │   └── token/route.ts                   # Gestión de tokens API
│   │   ├── test-token/page.tsx                  # Página de prueba de token
│   │   ├── globals.css                          # Estilos globales
│   │   ├── layout.tsx                           # Layout principal
│   │   └── page.tsx                             # Página principal
│   ├── components/
│   │   ├── ui/                                  # Componentes shadcn/ui
│   │   │   ├── alert.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── label.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── tooltip.tsx
│   │   ├── domain-table.tsx                     # Componente principal de dominios
│   │   ├── DomainRulesModal.tsx                 # Modal de gestión de reglas por dominio
│   │   ├── RulesActionBar.tsx                   # Barra de acciones masivas de reglas
│   │   ├── SecurityRulesIndicator.tsx           # Indicador de reglas de seguridad
│   │   └── SecurityRulesManager.tsx             # Gestión de plantillas de reglas
│   ├── lib/
│   │   ├── cloudflare.ts                        # Cliente API Cloudflare extendido
│   │   ├── ruleUtils.ts                         # Utilidades para reglas de seguridad
│   │   └── utils.ts                             # Utilidades compartidas
│   └── types/
│       └── cloudflare.ts                        # Tipos TypeScript extendidos
├── public/
│   └── logo-rollpix.png                         # Logo de la aplicación
├── .claude/
│   └── settings.local.json                      # Configuración Claude Code (local)
├── domains-cache.json                           # Cache de dominios (generado)
├── security-rules-templates.json                # Plantillas de reglas (generado)
├── domain-rules-status.json                     # Estado de reglas por dominio (generado)
├── user-preferences.json                        # Preferencias usuario (generado)
├── .nvmrc                                        # Versión de Node.js específica
└── .env.local                                    # Variables de entorno (generado)
```

## 🔄 Flujo de Funcionamiento

### Inicialización
1. **Verificación de token**: Comprueba si existe token API almacenado
2. **Carga de cache**: Intenta cargar datos desde `domains-cache.json`
3. **Fallback a API**: Si no hay cache, obtiene datos desde Cloudflare
4. **Carga de preferencias**: Restaura configuraciones de usuario

### Gestión de Dominios
1. **Detección de registros**: Identifica registros A y CNAME para www y root
2. **Estado de proxy**: Determina si el dominio tiene proxy habilitado
3. **Priorización**: Ordena por criterios inteligentes (sin proxy > sin registros > con proxy)

### Operaciones de Proxy
1. **Toggle individual**: Actualiza estado y refresca dominio específico
2. **Operaciones masivas**: Procesa selección múltiple en paralelo
3. **Feedback visual**: Indicadores de carga y notificaciones de resultado

## 🎯 Lógica de Priorización

El sistema utiliza un algoritmo de ordenamiento inteligente:

### Por Estado (Prioridad Alta)
1. **Dominios sin proxy con registros** - Requieren atención inmediata
2. **Dominios sin registros** - Necesitan configuración
3. **Dominios con proxy activo** - Funcionando correctamente

### Por Nombre (Secundario)
- Ordenamiento alfabético dentro de cada categoría de estado

## 🧪 Testing

### Ejecutar tests
```bash
# Tests unitarios
npm run test

# Tests E2E con Playwright
npm run test:e2e

# Tests en modo interactivo
npm run test:e2e:ui
```

### Cobertura de Tests
- Flujo completo de autenticación
- CRUD de operaciones de proxy
- Persistencia de datos y preferencias
- Responsive design y accesibilidad

## 🚀 Despliegue

### Vercel (Recomendado)
```bash
npm run build
npx vercel --prod
```

### Docker
```bash
docker build -t rollpix-cloudflare-manager .
docker run -p 3000:3000 rollpix-cloudflare-manager
```

### Variables de Entorno en Producción
- Configura `CLOUDFLARE_API_TOKEN` si quieres un token predeterminado
- Asegúrate de que el directorio de trabajo tenga permisos de escritura para cache

## 🔒 Seguridad

### Gestión de Tokens
- Tokens almacenados en variables de entorno locales
- No se exponen en el frontend
- Validación de permisos en cada request

### Validación de Datos
- Validación TypeScript en tiempo de compilación
- Sanitización de inputs en API routes
- Manejo seguro de errores sin exposición de información sensible

## 🐛 Solución de Problemas

### Token API no funciona
- Verifica que el token tenga los permisos correctos
- Confirma que las zonas estén incluidas en el token
- Revisa los logs de consola para errores específicos

### Cache no se actualiza
- Usa el botón "Actualizar Datos" para forzar refresh
- Verifica permisos de escritura en el directorio del proyecto
- Elimina manualmente `domains-cache.json` si está corrupto

### Rate Limiting
- El sistema está diseñado para evitar rate limiting
- Si ocurre, espera unos minutos antes de hacer más requests
- Considera usar cache local por más tiempo

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 🙋‍♂️ Soporte

Para soporte técnico o preguntas:
- Abre un issue en GitHub
- Contacta al equipo de desarrollo de Rollpix

---

**Desarrollado con ❤️ por el equipo de Rollpix**