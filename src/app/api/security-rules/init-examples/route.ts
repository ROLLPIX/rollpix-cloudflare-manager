import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { RuleTemplate } from '@/types/cloudflare';

const RULES_CACHE_FILE = path.join(process.cwd(), 'security-rules-templates.json');

interface RulesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

// POST - Initialize example security rules
export async function POST() {
  try {
    const exampleTemplates: RuleTemplate[] = [
      {
        id: uuidv4(),
        friendlyId: "R001",
        name: "Bloqueo de Países de Riesgo",
        description: "Bloquea tráfico de países considerados de alto riesgo para ataques cibernéticos",
        enabled: true,
        priority: 1,
        expression: '(ip.geoip.country in {"CN" "RU" "KP" "IR"})',
        action: 'block',
        actionParameters: {
          response: {
            status_code: 403,
            content: "Access denied from your location",
            content_type: "text/plain"
          }
        },
        tags: ["geographic", "security", "corporate"],
        applicableTags: ["production", "staging"],
        excludedDomains: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0"
      },
      {
        id: uuidv4(),
        friendlyId: "R002",
        name: "Detección de Bots Maliciosos",
        description: "Detecta y desafía bots conocidos y user agents sospechosos",
        enabled: true,
        priority: 2,
        expression: '(http.user_agent contains "bot" and not http.user_agent contains "googlebot" and not http.user_agent contains "bingbot") or (http.user_agent eq "")',
        action: 'challenge',
        actionParameters: {},
        tags: ["bot-protection", "security", "corporate"],
        applicableTags: ["production"],
        excludedDomains: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0"
      },
      {
        id: uuidv4(),
        friendlyId: "R003",
        name: "Rate Limiting Agresivo",
        description: "Limita requests excesivos de IPs individuales para prevenir ataques DDoS",
        enabled: true,
        priority: 3,
        expression: '(rate(1m) > 100)',
        action: 'block',
        actionParameters: {
          response: {
            status_code: 429,
            content: "Too many requests. Please slow down.",
            content_type: "text/plain"
          }
        },
        tags: ["rate-limiting", "ddos-protection", "corporate"],
        applicableTags: ["production", "staging"],
        excludedDomains: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0"
      },
      {
        id: uuidv4(),
        friendlyId: "R004",
        name: "Bloqueo de SQL Injection",
        description: "Detecta y bloquea intentos comunes de inyección SQL en parámetros de URL",
        enabled: true,
        priority: 4,
        expression: '(http.request.uri.query contains "union select" or http.request.uri.query contains "drop table" or http.request.uri.query contains "insert into" or http.request.uri.query contains "delete from")',
        action: 'block',
        actionParameters: {
          response: {
            status_code: 403,
            content: "Malicious request detected",
            content_type: "text/plain"
          }
        },
        tags: ["injection-protection", "security", "corporate"],
        applicableTags: ["production", "staging"],
        excludedDomains: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0"
      },
      {
        id: uuidv4(),
        friendlyId: "R005",
        name: "Horario de Acceso Restringido",
        description: "Restringe acceso fuera del horario laboral (solo para sitios internos)",
        enabled: false,
        priority: 5,
        expression: '(http.request.timestamp.hour < 8 or http.request.timestamp.hour > 18)',
        action: 'block',
        actionParameters: {
          response: {
            status_code: 403,
            content: "Access restricted outside business hours (8 AM - 6 PM)",
            content_type: "text/plain"
          }
        },
        tags: ["time-restriction", "internal", "corporate"],
        applicableTags: ["internal"],
        excludedDomains: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0"
      }
    ];

    const cache: RulesCache = {
      templates: exampleTemplates,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(RULES_CACHE_FILE, JSON.stringify(cache, null, 2));

    return NextResponse.json({
      success: true,
      data: {
        templates: exampleTemplates,
        message: `${exampleTemplates.length} plantillas de ejemplo creadas exitosamente`
      }
    });

  } catch (error) {
    console.error('Error creating example rules:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create example rules'
    }, { status: 500 });
  }
}