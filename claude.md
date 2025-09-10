# ROLLPIX Cloudflare Manager - Claude Development Documentation

## Proyecto Overview

**ROLLPIX Cloudflare Manager** es una aplicación web desarrollada con Next.js 14 para gestionar visualmente el estado de proxy DNS de dominios en Cloudflare. La aplicación permite a los equipos monitorear y controlar múltiples dominios de forma eficiente, con funcionalidades avanzadas de cache, filtrado y gestión masiva.

## Arquitectura Técnica

### Stack Tecnológico
- **Frontend**: Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind CSS
- **Backend**: Next.js API Routes + Cloudflare API v4
- **Persistencia**: JSON local (cache de dominios + preferencias de usuario)
- **Testing**: Playwright E2E
- **UI/UX**: Lucide React icons + Sonner notifications

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
- `domains-cache.json`: Cache de todos los dominios y sus estados
- `user-preferences.json`: Configuraciones de usuario (paginación, filtros, ordenamiento)
- `.env.local`: Token API de Cloudflare

### API Routes Implementadas

#### `/api/domains` - Gestión de Dominios
```typescript
GET: Obtiene dominios con paginación automática de Cloudflare API
- Parámetros: apiToken (header)
- Respuesta: DomainStatus[] con información completa
- Rate limiting: Manejado con paginación de 100 dominios por request
```

#### `/api/proxy-toggle` - Control de Proxy
```typescript
POST: Habilita/deshabilita proxy para registros específicos
- Body: { zoneId, recordId, proxied: boolean }
- Validación: Verifica existencia de zona y registro
- Respuesta: Estado actualizado del registro
```

#### `/api/cache` - Sistema de Cache
```typescript
GET: Retorna cache de dominios si existe
POST: Actualiza cache con nuevos datos de dominios
- Formato: { domains: DomainStatus[], lastUpdate: string, totalCount: number }
```

#### `/api/preferences` - Preferencias de Usuario
```typescript
GET: Carga preferencias guardadas o defaults
POST: Actualiza preferencias con merge inteligente
- Campos: perPage, sortBy, filter, searchTerm, lastUpdated
```

#### `/api/token` - Gestión de Token API
```typescript
GET: Verifica si existe token en .env.local
POST: Almacena token en .env.local de forma segura
- Seguridad: Token nunca expuesto en frontend
```

## Funcionalidades Implementadas

### 1. Gestión Visual de Dominios
- **Detección inteligente de registros**: Identifica A y CNAME para @ y www
- **Indicadores visuales**: Shields verdes/rojos con iconografía consistente
- **Estados prioritarios**: Sin proxy > Sin registros > Con proxy

### 2. Control de Proxy Avanzado
```typescript
// Toggle individual con refresh selectivo
const refreshSpecificDomain = useCallback(async (zoneId: string) => {
  // Actualiza solo el dominio modificado
  const updatedDomain = await fetchDomainDetails(zoneId);
  setAllDomains(prev => prev.map(d => d.zoneId === zoneId ? updatedDomain : d));
}, []);

// Operaciones masivas con procesamiento paralelo
const handleBulkAction = async (action: 'enable' | 'disable') => {
  const promises = selectedDomains.map(zoneId => toggleProxy(zoneId, action));
  await Promise.all(promises);
};
```

### 3. Sistema de Filtrado y Ordenamiento
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

### 4. Persistencia y Performance
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

## Roadmap y Mejoras Futuras

### Features Planeadas
1. **Export/Import**: Configuraciones de dominios en JSON/CSV
2. **Bulk DNS Management**: Edición masiva de registros
3. **Analytics Dashboard**: Métricas de uso y performance
4. **Multi-account Support**: Gestión de múltiples cuentas Cloudflare
5. **Webhook Integration**: Notificaciones automáticas de cambios

### Optimizaciones Técnicas
1. **Database Integration**: Migrar de JSON a PostgreSQL/SQLite
2. **Real-time Updates**: WebSockets para cambios en tiempo real
3. **Advanced Caching**: Redis para cache distribuido
4. **API Rate Limiting**: Implementar queue system
5. **Security Enhancements**: RBAC y audit logging

---

**Desarrollado para Rollpix con Claude Code**  
*Documentación técnica completa para desarrollo y mantenimiento*