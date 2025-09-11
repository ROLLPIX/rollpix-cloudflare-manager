import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { RuleTemplate } from '@/types/cloudflare';

const RULES_CACHE_FILE = path.join(process.cwd(), 'security-rules-templates.json');

interface RulesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

async function loadRulesCache(): Promise<RulesCache> {
  try {
    const data = await fs.readFile(RULES_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      templates: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

async function saveRulesCache(cache: RulesCache): Promise<void> {
  cache.lastUpdated = new Date().toISOString();
  await fs.writeFile(RULES_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// PUT - Actualizar plantilla específica
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, description, expression, action, actionParameters, tags, applicableTags, excludedDomains, enabled } = body;

    if (!name || !expression || !action) {
      return NextResponse.json({
        success: false,
        error: 'Name, expression, and action are required'
      }, { status: 400 });
    }

    const cache = await loadRulesCache();
    const templateIndex = cache.templates.findIndex(template => template.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Rule template not found'
      }, { status: 404 });
    }

    const existingTemplate = cache.templates[templateIndex];
    
    // Check for duplicate names (excluding current template)
    if (cache.templates.some(template => template.name === name && template.id !== id)) {
      return NextResponse.json({
        success: false,
        error: 'A rule template with this name already exists'
      }, { status: 400 });
    }
    
    // Increment version for significant changes
    let newVersion = existingTemplate.version;
    if (expression !== existingTemplate.expression || action !== existingTemplate.action) {
      const versionParts = existingTemplate.version.split('.');
      versionParts[1] = String(parseInt(versionParts[1]) + 1);
      newVersion = versionParts.join('.');
    }

    const updatedTemplate: RuleTemplate = {
      ...existingTemplate,
      name,
      description: description || '',
      expression,
      action,
      actionParameters: actionParameters || {},
      tags: tags || [],
      applicableTags: applicableTags || [],
      excludedDomains: excludedDomains || [],
      enabled: enabled !== undefined ? enabled : existingTemplate.enabled,
      updatedAt: new Date().toISOString(),
      version: newVersion
    };

    cache.templates[templateIndex] = updatedTemplate;
    await saveRulesCache(cache);

    return NextResponse.json({
      success: true,
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Error updating security rule:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update security rule'
    }, { status: 500 });
  }
}

// DELETE - Eliminar plantilla específica
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const cache = await loadRulesCache();
    const templateIndex = cache.templates.findIndex(template => template.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Rule template not found'
      }, { status: 404 });
    }

    const deletedTemplate = cache.templates.splice(templateIndex, 1)[0];
    await saveRulesCache(cache);

    return NextResponse.json({
      success: true,
      data: deletedTemplate
    });
  } catch (error) {
    console.error('Error deleting security rule:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete security rule'
    }, { status: 500 });
  }
}