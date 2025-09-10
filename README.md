# ROLLPIX Cloudflare Manager

![Rollpix Logo](public/logo-rollpix.png)

Una aplicación web moderna para gestionar visualmente el estado de proxy DNS de dominios en Cloudflare. Desarrollada con Next.js 14 y diseñada específicamente para equipos que necesitan monitorear y controlar múltiples dominios de forma eficiente.

## 🚀 Características Principales

### Gestión Visual de Dominios
- **Indicadores visuales intuitivos**: Iconos de escudo verde (proxied) y rojo (not proxied) para identificar rápidamente el estado
- **Vista de tabla optimizada**: Información clara con dominio, tipo de registro, estado actual y acciones
- **Conteo inteligente**: Progreso basado en dominios únicos, no en registros individuales

### Control de Proxy Avanzado
- **Toggle individual**: Habilitar/deshabilitar proxy para dominios específicos con un clic
- **Acciones masivas**: Selección múltiple para operaciones en lote
- **Actualización selectiva**: Refresh automático solo de dominios modificados para optimizar rendimiento

### Sistema de Persistencia Inteligente
- **Cache JSON local**: Evita límites de rate limiting de la API de Cloudflare
- **Preferencias de usuario**: Persistencia de configuraciones (items por página, ordenamiento, filtros)
- **Token API seguro**: Almacenamiento automático en variables de entorno

### Funcionalidades de Productividad
- **Ordenamiento inteligente**: Por nombre o estado con priorización automática
- **Filtrado avanzado**: Ver todos, solo proxied, o solo not-proxied
- **Búsqueda en tiempo real**: Filtrado instantáneo por nombre de dominio
- **Paginación configurable**: 12, 24, 48 o 96 dominios por página

## 🛠 Tecnologías Utilizadas

### Frontend
- **Next.js 14** - App Router con Turbopack para desarrollo rápido
- **TypeScript** - Tipado fuerte para mayor seguridad y productividad
- **shadcn/ui** - Componentes UI modernos y accesibles
- **Tailwind CSS** - Estilizado utilitario y responsive
- **Lucide React** - Iconografía consistente y profesional

### Backend y APIs
- **Next.js API Routes** - Endpoints serverless para manejo de datos
- **Cloudflare API v4** - Integración completa con servicios de Cloudflare
- **JSON File System** - Persistencia local para cache y preferencias

### Herramientas de Desarrollo
- **Playwright** - Testing end-to-end automatizado
- **ESLint** - Linting y calidad de código
- **Sonner** - Notificaciones toast elegantes

## 📋 Requisitos Previos

- Node.js 18.17 o superior
- Token API de Cloudflare con permisos de lectura y escritura para zonas DNS
- npm o yarn como gestor de paquetes

## 🔧 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/ROLLPIX/rollpix-cloudflare-manager.git
cd rollpix-cloudflare-manager
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env.local
```

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 🔑 Configuración del Token API

### Obtener Token de Cloudflare
1. Accede a [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Crea un token personalizado con los siguientes permisos:
   - **Zone Settings:Read**
   - **DNS:Edit**
   - **Zone:Read**
3. Incluye todas las zonas que deseas gestionar

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
│   │   │   ├── cache/route.ts          # Gestión de cache JSON
│   │   │   ├── domains/route.ts        # Fetch de dominios con paginación
│   │   │   ├── preferences/route.ts    # Persistencia de preferencias
│   │   │   ├── proxy-toggle/route.ts   # Toggle de estado proxy
│   │   │   └── token/route.ts          # Gestión de tokens API
│   │   ├── globals.css                 # Estilos globales
│   │   ├── layout.tsx                  # Layout principal
│   │   └── page.tsx                    # Página principal
│   ├── components/
│   │   ├── ui/                         # Componentes shadcn/ui
│   │   └── domain-table.tsx            # Componente principal
│   ├── lib/
│   │   ├── cloudflare.ts              # Cliente API Cloudflare
│   │   └── utils.ts                   # Utilidades compartidas
│   └── types/
│       └── cloudflare.ts              # Tipos TypeScript
├── public/
│   └── logo-rollpix.png              # Logo de la aplicación
├── domains-cache.json                # Cache de dominios (generado)
├── user-preferences.json             # Preferencias usuario (generado)
└── .env.local                        # Variables de entorno (generado)
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