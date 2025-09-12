# ROLLPIX Cloudflare Manager - Claude Development Documentation

## Proyecto Overview

**ROLLPIX Cloudflare Manager** es una aplicación web desarrollada con **Next.js 15.5.3** para gestionar visualmente dominios en Cloudflare con **sistema completo de reglas de seguridad**. La aplicación permite a los equipos monitorear y controlar múltiples dominios de forma eficiente, incluyendo gestión avanzada de reglas de firewall, operaciones masivas, y detección de conflictos.

## Versiones y Dependencias Críticas

### Entorno de Desarrollo Probado
- **Node.js**: `20.15.1` (requerido >= 20.x)
- **npm**: `10.7.0` 
- **Sistema Operativo**: Windows 11 (compatible con macOS/Linux)

### Stack Tecnológico Actualizado
- **Frontend**: Next.js 15.5.3 (App Router + Turbopack) + React 19.1.0 + TypeScript 5.x
- **UI Framework**: shadcn/ui (Radix UI v1.x) + Tailwind CSS 4.x
- **Backend**: Next.js API Routes + Cloudflare API v4 (DNS + Rulesets)
- **Persistencia**: JSON local (3 archivos de cache + preferencias de usuario)
- **Testing**: Playwright 1.55.0 E2E
- **Icons & UX**: Lucide React 0.543.0 + Sonner 2.0.7 notifications

### Dependencias Principales Exactas
```json
{
  "next": "15.5.3",
  "react": "19.1.0", 
  "react-dom": "19.1.0",
  "typescript": "^5",
  "tailwindcss": "^4",
  "lucide-react": "^0.543.0",
  "sonner": "^2.0.7",
  "uuid": "^13.0.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.3.1"
}
```

### Radix UI Components (shadcn/ui)
```json
{
  "@radix-ui/react-checkbox": "^1.3.3",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-label": "^2.1.7",
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-slot": "^1.2.3",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-tooltip": "^1.2.8"
}
```

### Estructura de Componentes

```typescript
// Componente principal: DomainTable
interface DomainTableProps {
  apiToken: string;
}

// Estado principal del componente
const [allDomains, setAllDomains] = useState<DomainStatus[]>([]);
const [filteredAndSortedDomains, setFilteredAndSortedDomains] = useState<DomainStatus[]>([]);
const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
```

### Sistema de Cache Inteligente

El sistema implementa un cache JSON local para evitar rate limiting de la API de Cloudflare:

```typescript
// Flujo de datos
1. Primer load: API → Cache JSON → Estado React
2. Navegación: Cache JSON → Estado React (instantáneo)
3. Refresh manual: API → Cache JSON → Estado React
4. Update selectivo: API (dominio específico) → Cache JSON → Estado React
```

**Archivos de persistencia:**
- `domains-cache.json`: Cache de todos los dominios y sus estados DNS
- `security-rules-templates.json`: Plantillas de reglas de seguridad versionadas
- `domain-rules-status.json`: Estado de reglas por dominio con análisis de conflictos
- `user-preferences.json`: Configuraciones de usuario (paginación, filtros, ordenamiento)
- `.env.local`: Token API de Cloudflare
- `.nvmrc`: Versión específica de Node.js (20.15.1)

### API Routes Implementadas

#### Sistema de Dominios
- **`/api/domains`**: Gestión principal de dominios con paginación automática
- **`/api/domains/enrich`**: Enriquecimiento con datos de reglas de seguridad
- **`/api/proxy-toggle`**: Control individual de proxy DNS

#### Sistema de Reglas de Seguridad 🔥 **NUEVO**
- **`/api/security-rules`**: CRUD de plantillas de reglas versionadas
- **`/api/security-rules/[id]`**: Gestión individual de plantillas
- **`/api/security-rules/analyze`**: Análisis de reglas por dominio con detección de conflictos
- **`/api/security-rules/apply`**: Aplicación de reglas específicas
- **`/api/security-rules/init-examples`**: Inicialización con reglas ejemplo

#### Gestión de Reglas por Dominio
- **`/api/domains/rules/[zoneId]`**: Obtener reglas específicas de una zona
- **`/api/domains/rules/bulk-action`**: Acciones masivas (add/remove/clean) con preview
- **`/api/domains/rules/clean`**: Limpieza de reglas por tipo (template/custom/all)
- **`/api/domains/rules/custom/[ruleId]`**: Eliminar reglas personalizadas individuales

#### Infraestructura
- **`/api/cache`**: Sistema de cache para dominios
- **`/api/preferences`**: Persistencia de configuraciones de usuario
- **`/api/token`**: Gestión segura de tokens API
- **`/api/test-token`**: Validación completa de permisos de token

### Cloudflare API Integration

#### Permisos de Token Requeridos
```
Zone Settings: Read
DNS: Edit  
Zone: Read
Zone Firewall Access Rules: Edit  
Account Firewall Access Rules: Read
Zone WAF: Edit
```

#### Cloudflare Rulesets API
```typescript
// Solo procesa rulesets de tipo 'http_request_firewall_custom'
const customRulesets = rulesets.filter(r => r.phase === 'http_request_firewall_custom');

// Diferencia entre reglas de plantilla vs personalizadas
const isTemplateRule = (description: string) => {
  return /^.*#[A-Z]\d+v[\d.]+.*$/.test(description);
};
```

## Funcionalidades Implementadas

### 1. Gestión Visual de Dominios (Mejorado)
- **Indicadores visuales corregidos**: Shield (proxy activo) vs ShieldOff (DNS-only)
- **Columna de reglas avanzada**: Pills con friendlyId + contador de reglas custom (+X)
- **Estados prioritarios**: Sin proxy > Sin registros > Con proxy
- **Botón unificado de actualización**: Checkboxes para DNS/Firewall/Reglas con progreso

### 2. Sistema de Reglas de Seguridad 🔥 **NUEVO**
```typescript
interface RuleTemplate {
  id: string;
  friendlyId: string;      // R01, R02, etc.
  name: string;
  description: string;
  version: string;         // Versionado para updates
  expression: string;      // Cloudflare rule expression
  action: 'block' | 'challenge' | 'allow' | 'log';
  enabled: boolean;
  tags: string[];
}
```

#### Funcionalidades Principales:
- **Gestión de plantillas**: Crear/editar/eliminar plantillas con versionado
- **Aplicación masiva**: Aplicar/remover reglas en múltiples dominios
- **Detección de conflictos**: Análisis automático de versiones obsoletas
- **Modal por dominio**: Vista detallada con reglas template + custom
- **Actualización inteligente**: Botón para update masivo a nueva versión
- **Preview de operaciones**: Vista previa antes de aplicar cambios masivos

### 3. Control de Proxy Avanzado (Mejorado)
```typescript
// Confirmación de cambio de token API
const [showChangeTokenDialog, setShowChangeTokenDialog] = useState(false);

// Progreso visual para operaciones masivas
const handleBulkAction = async (action: 'enable' | 'disable') => {
  setBulkProgress({ current: 0, total: operations.length });
  // Procesamiento con progreso visual
  for (let i = 0; i < operations.length; i++) {
    setBulkProgress(prev => ({ ...prev, current: i + 1 }));
    await toggleProxy(operations[i]);
    await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
  }
};
```

### 4. Sistema de Filtrado y Ordenamiento
```typescript
// Ordenamiento inteligente por estado
const getStatusPriority = (status: DomainStatus) => {
  if (status.hasRecords && !status.isProxied) return 1; // Máxima prioridad
  if (!status.hasRecords) return 2; // Media prioridad  
  return 3; // Mínima prioridad (proxied)
};

// Filtrado en tiempo real
const filterDomains = useMemo(() => {
  return allDomains
    .filter(domain => domain.name.includes(searchTerm))
    .filter(domain => {
      if (filter === 'proxied') return domain.isProxied;
      if (filter === 'not-proxied') return !domain.isProxied;
      return true; // 'all'
    })
    .sort((a, b) => {
      if (sortBy === 'status') {
        return getStatusPriority(a) - getStatusPriority(b);
      }
      return a.name.localeCompare(b.name);
    });
}, [allDomains, searchTerm, filter, sortBy]);
```

### 5. Persistencia y Performance (Extendido)
- **Cache automático**: Evita re-fetching innecesario
- **Preferencias persistentes**: UX consistente entre sesiones  
- **Paginación inteligente**: Carga total una vez, pagina en cliente
- **Updates selectivos**: Solo refresca dominios modificados

## Lógica de Negocio

### Detección de Estado de Proxy
```typescript
interface DomainStatus {
  zoneId: string;
  name: string;
  hasRecords: boolean;  // Tiene registros A o CNAME para @ o www
  isProxied: boolean;   // Algún registro tiene proxy habilitado
  rootRecord?: DNSRecord; // Registro para @
  wwwRecord?: DNSRecord;  // Registro para www
}
```

### Priorización Visual
1. **🔴 Sin proxy con registros**: Necesita atención inmediata
2. **⚫ Sin registros**: Requiere configuración inicial  
3. **🟢 Con proxy**: Funcionando correctamente

### Gestión de Rate Limiting
- **Primera carga**: Fetch completo con paginación → Cache
- **Navegación**: Solo lee cache (0 API calls)
- **Refresh manual**: Re-fetch completo → Actualiza cache
- **Toggle proxy**: API call específico → Update cache selectivo

## Patrones de Desarrollo

### Hooks Personalizados
```typescript
// Cache management
const useDomainsCache = () => {
  const loadFromCache = async () => { /* ... */ };
  const saveToCache = async (domains) => { /* ... */ };
  return { loadFromCache, saveToCache };
};

// Preferences management  
const usePreferences = () => {
  const loadPreferences = async () => { /* ... */ };
  const savePreferences = async (prefs) => { /* ... */ };
  return { loadPreferences, savePreferences };
};
```

### Error Handling
```typescript
// API error handling con fallbacks
try {
  const response = await fetch('/api/domains');
  if (!response.ok) throw new Error('API Error');
  const data = await response.json();
} catch (error) {
  console.error('Error loading domains:', error);
  toast.error('Error al cargar dominios');
  // Fallback to cache if available
  const cachedData = await loadFromCache();
  if (cachedData) setDomains(cachedData.domains);
}
```

### Performance Optimizations
- **useMemo**: Para filtrado y ordenamiento costoso
- **useCallback**: Para funciones que se pasan como props
- **Lazy loading**: Componentes UI solo cuando son necesarios
- **Debounced search**: Evita re-renders excesivos en búsqueda

## Testing Strategy

### Playwright E2E Tests
```typescript
// Test flow completo
test('domain management workflow', async ({ page }) => {
  // 1. Token authentication
  await page.fill('[placeholder*="token"]', validToken);
  await page.click('text=Conectar');
  
  // 2. Domain loading and display
  await expect(page.locator('.domain-row')).toBeVisible();
  
  // 3. Proxy toggle functionality  
  await page.click('.proxy-toggle-button').first();
  await expect(page.locator('.toast')).toContainText('actualizado');
  
  // 4. Bulk operations
  await page.check('.domain-checkbox').first();
  await page.click('text=Habilitar Proxy');
  
  // 5. Preferences persistence
  await page.selectOption('[name="perPage"]', '48');
  await page.reload();
  await expect(page.locator('[name="perPage"]')).toHaveValue('48');
});
```

## Configuración del Entorno

### Variables de Entorno
```bash
# .env.local
CLOUDFLARE_API_TOKEN=your_token_here  # Opcional: token predeterminado
```

### Dependencias Principales
```json
{
  "dependencies": {
    "next": "^14.2.0",
    "typescript": "^5.0.0", 
    "@radix-ui/react-*": "shadcn/ui components",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.400.0",
    "sonner": "^1.5.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "eslint": "^8.57.0"
  }
}
```

## Despliegue y Mantenimiento

### Build y Deploy
```bash
# Desarrollo
npm run dev

# Build optimizado
npm run build
npm start

# Testing
npm run test        # Playwright E2E
npm run lint       # ESLint check
```

### Vercel Deployment
- **Auto-deploy**: Push a main → Deploy automático
- **Environment variables**: Configurar en Vercel dashboard
- **Build command**: `npm run build`
- **Output directory**: `.next`

### Monitoreo en Producción
- **Error tracking**: Console logs para debugging
- **Performance**: Next.js analytics integrado  
- **Cache management**: Logs de hit/miss ratio
- **API usage**: Tracking de calls a Cloudflare API

## Problemas Comunes y Soluciones

### Incompatibilidades de Dependencias
**Problema**: Error al instalar en diferentes entornos debido a versiones de dependencias
**Solución**: 
```bash
# Usar versiones exactas del package-lock.json
npm ci

# Si hay conflictos, limpiar y reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm install react@19.1.0 react-dom@19.1.0 next@15.5.3
```

### Next.js 15 + React 19 Conflicts
**Problema**: Conflictos entre React 19 y librerías externas
**Solución**:
```bash
# Usar resoluciones específicas en package.json si es necesario
npm install --force
# O downgrade a versiones estables si Turbopack da problemas
```

### Tailwind CSS 4 Issues
**Problema**: Tailwind CSS 4 puede causar incompatibilidades
**Solución**:
```bash
# Usar Tailwind CSS 3 si hay problemas
npm install tailwindcss@^3.4.0 @tailwindcss/postcss@^3
```

### shadcn/ui Components Missing
**Problema**: Componentes UI no encontrados en nuevos entornos
**Solución**:
```bash
# Reinstalar componentes requeridos
npx shadcn@latest add dialog popover tabs tooltip alert separator
```

### Node.js Version Issues
**Problema**: Incompatibilidad con versiones de Node.js
**Solución**:
```bash
# Usar nvm con el archivo .nvmrc incluido
nvm use          # Lee automáticamente .nvmrc
nvm install 20.15.1
```

### Cloudflare API Permissions
**Problema**: Token sin permisos suficientes para reglas
**Solución**: Verificar que el token incluya todos estos permisos:
- Zone Settings: Read
- DNS: Edit  
- Zone: Read
- Zone Firewall Access Rules: Edit  
- Account Firewall Access Rules: Read
- Zone WAF: Edit

## Instalación en Nuevos Entornos

### Checklist de Setup
1. ✅ Verificar Node.js >= 20.15.1
2. ✅ Clonar repo e instalar con `npm ci`
3. ✅ Crear token de Cloudflare con permisos completos
4. ✅ Ejecutar `npm run dev`
5. ✅ Probar funcionalidad en `/test-token`
6. ✅ Verificar reglas de seguridad funcionando

### Comandos de Verificación
```bash
# Verificar versiones
node --version    # >= 20.15.1
npm --version     # >= 10.7.0

# Test completo
npm run build     # Debe compilar sin errores
npm run test      # Tests deben pasar (si están configurados)
```

## Roadmap y Mejoras Futuras

### Features Implementadas ✅
1. **Sistema completo de reglas de seguridad** - DONE
2. **Operaciones masivas con progreso visual** - DONE
3. **Detección de conflictos y versioning** - DONE
4. **UI/UX mejorado con iconos correctos** - DONE
5. **Confirmaciones y prevención de errores** - DONE

### Features Planeadas 🔄
1. **Firewall Rules Management**: Completar checkbox de Firewall en actualización
2. **Export/Import**: Configuraciones de reglas en JSON/CSV
3. **Analytics Dashboard**: Métricas de uso y performance de reglas
4. **Multi-account Support**: Gestión de múltiples cuentas Cloudflare
5. **Webhook Integration**: Notificaciones automáticas de cambios de reglas

### Optimizaciones Técnicas
1. **Database Integration**: Migrar de JSON a PostgreSQL/SQLite
2. **Real-time Updates**: WebSockets para cambios en tiempo real
3. **Advanced Caching**: Redis para cache distribuido
4. **API Rate Limiting**: Implementar queue system avanzado
5. **Security Enhancements**: RBAC y audit logging para reglas

---

**Desarrollado para Rollpix con Claude Code**  
*Versión actualizada con sistema completo de reglas de seguridad*
*Documentación técnica completa para desarrollo y mantenimiento en múltiples entornos*