# Estrategias de Desarrollo para Evitar Regressions

## 1. **Principio de Desarrollo Incremental**

### ✅ **DO - Enfoque Aditivo**
```typescript
// ✅ BIEN: Agregar nueva funcionalidad sin tocar la existente
const handleBulkActionOLD = (actionType) => {
  // Funcionalidad existente que YA FUNCIONA
  if (onBulkProxy) await onBulkProxy(enabled);
};

const handleBulkActionNEW = (actionType) => {
  // Nueva funcionalidad con modal de progreso
  // Solo cuando esté 100% probada, reemplazar la antigua
};
```

### ❌ **DON'T - Reemplazar Funcionalidad Existente**
```typescript
// ❌ MAL: Reemplazar directamente funcionalidad que funciona
const handleBulkAction = (actionType) => {
  // Esto rompió la funcionalidad DNS que YA FUNCIONABA
  setAction(actionType);
  setShowProgressModal(true);
};
```

## 2. **Checklist Pre-Cambios**

### Antes de cualquier modificación:
- [ ] **Identificar qué funcionalidad existe y funciona**
- [ ] **Probar la funcionalidad actual manualmente**
- [ ] **Hacer backup con git stash o branch**
- [ ] **Implementar nueva funcionalidad PARALELA a la existente**
- [ ] **Probar nueva funcionalidad aisladamente**
- [ ] **Solo reemplazar cuando nueva funcionalidad esté 100% probada**

## 3. **Patrón de Feature Flags**

```typescript
interface FeatureFlags {
  useNewProgressModal: boolean;
  useStreamingAPI: boolean;
}

const features: FeatureFlags = {
  useNewProgressModal: false, // Empezar siempre en false
  useStreamingAPI: false
};

const handleBulkAction = (actionType: string, enabled: boolean) => {
  if (features.useNewProgressModal) {
    // Nueva funcionalidad
    return handleBulkActionWithModal(actionType, enabled);
  } else {
    // Funcionalidad original que YA FUNCIONA
    return handleBulkActionOriginal(actionType, enabled);
  }
};
```

## 4. **Testing Preventivo**

### Manual Testing Checklist:
- [ ] Proxy toggle funciona en 2-3 dominios
- [ ] Under Attack Mode funciona
- [ ] Bot Fight Mode funciona
- [ ] Reglas de seguridad funcionan
- [ ] Modal de progreso funciona para reglas

### Automated Testing:
```bash
# Antes de pushear cambios
npm run build        # Compilación exitosa
npm run lint         # Sin errores de linting
npm run type-check   # Sin errores TypeScript
```

## 5. **Desarrollo en Ramas**

```bash
# Para cambios grandes, usar ramas feature
git checkout -b feature/streaming-dns-firewall
# Desarrollar nueva funcionalidad
# Probar exhaustivamente
# Solo hacer merge cuando esté 100% funcionando

# Para hotfixes, directamente a main
git checkout main
# Cambio pequeño y específico
```

## 6. **Principio de Responsabilidad Única**

### ✅ **DO - Una responsabilidad por función**
```typescript
// Función para reglas (nueva funcionalidad)
const handleRulesOperation = () => {
  // Solo maneja reglas de seguridad
};

// Función para DNS (funcionalidad existente)
const handleDNSOperation = () => {
  // Solo maneja operaciones DNS
};

// Función para Firewall (funcionalidad existente)
const handleFirewallOperation = () => {
  // Solo maneja operaciones firewall
};
```

### ❌ **DON'T - Una función que maneja todo**
```typescript
// ❌ MAL: Una función que maneja todo y puede romper cualquier cosa
const handleAllOperations = (type: string) => {
  // Lógica compleja que puede romper múltiples funcionalidades
};
```

## 7. **Validación de Estado**

Antes de modificar componentes, verificar:
- ¿Qué props recibe?
- ¿Qué callbacks espera?
- ¿Qué funcionalidad implementa actualmente?
- ¿Cómo se usa desde el componente padre?

## 8. **Documentación de Cambios**

```typescript
// TODO: ANTES DE MODIFICAR
// Funcionalidad actual: handleBulkAction llama a onBulkProxy directamente
// Nueva funcionalidad: Agregar modal de progreso PARALELO
// Plan: Mantener funcionalidad original hasta que nueva esté probada

const handleBulkAction = () => {
  // CURRENT: Working functionality - DO NOT BREAK
  // PLAN: Add new modal system in parallel
};
```

## 9. **Testing de Regresión**

Después de cualquier cambio, probar:
1. **Funcionalidad principal** (lo que se estaba implementando)
2. **Funcionalidad relacionada** (lo que podría verse afectado)
3. **Funcionalidad crítica** (proxy toggle, reglas de seguridad)

## 10. **Rollback Strategy**

```bash
# Si algo se rompe, rollback inmediato
git stash          # Guardar cambios actuales
git reset --hard   # Volver al último commit funcional
# Diagnosticar problema
# Implementar fix
# Aplicar cambios de forma incremental
```