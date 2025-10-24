import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SecurityRule, RuleTemplate } from '@/types/cloudflare';
import { generateNextFriendlyId } from '@/lib/ruleUtils';

const RULES_CACHE_FILE = path.join(process.cwd(), 'cache', 'security-rules-templates.json');

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
  try {
    cache.lastUpdated = new Date().toISOString();
    const jsonData = JSON.stringify(cache, null, 2);

    console.log('[Security Rules] 💾 Saving rules cache...');
    console.log(`[Security Rules] File path: ${RULES_CACHE_FILE}`);
    console.log(`[Security Rules] Templates count: ${cache.templates.length}`);
    console.log(`[Security Rules] Data size: ${jsonData.length} bytes`);

    // Check if directory exists
    const cacheDir = path.dirname(RULES_CACHE_FILE);
    try {
      await fs.access(cacheDir);
      console.log(`[Security Rules] ✅ Cache directory exists: ${cacheDir}`);
    } catch (error) {
      console.log(`[Security Rules] ⚠️ Cache directory does not exist, creating: ${cacheDir}`);
      await fs.mkdir(cacheDir, { recursive: true });
      console.log(`[Security Rules] ✅ Cache directory created`);
    }

    // Write file
    await fs.writeFile(RULES_CACHE_FILE, jsonData, 'utf-8');
    console.log(`[Security Rules] ✅ Rules cache saved successfully`);

    // Verify write
    const verifyData = await fs.readFile(RULES_CACHE_FILE, 'utf-8');
    const verifyParsed = JSON.parse(verifyData);
    console.log(`[Security Rules] ✅ Verification: ${verifyParsed.templates.length} templates in file`);

    if (verifyParsed.templates.length !== cache.templates.length) {
      console.error(`[Security Rules] ❌ MISMATCH: Expected ${cache.templates.length}, got ${verifyParsed.templates.length}`);
      throw new Error('Template count mismatch after save');
    }
  } catch (error) {
    console.error('[Security Rules] ❌ Error saving rules cache:', error);
    console.error('[Security Rules] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      path: RULES_CACHE_FILE,
      templatesCount: cache.templates.length
    });
    throw error;
  }
}

// GET - Obtener todas las plantillas de reglas
export async function GET() {
  try {
    const cache = await loadRulesCache();
    return NextResponse.json({
      success: true,
      data: {
        templates: cache.templates,
        lastUpdated: cache.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error loading security rules:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load security rules'
    }, { status: 500 });
  }
}

// POST - Crear nueva plantilla de regla
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, expression, action, actionParameters, tags, applicableTags, excludedDomains } = body;

    if (!name || !expression || !action) {
      return NextResponse.json({
        success: false,
        error: 'Name, expression, and action are required'
      }, { status: 400 });
    }

    const cache = await loadRulesCache();
    
    // Check for duplicate names
    if (cache.templates.some(template => template.name === name)) {
      return NextResponse.json({
        success: false,
        error: 'A rule template with this name already exists'
      }, { status: 400 });
    }

    const friendlyId = generateNextFriendlyId(cache.templates);
    
    const newTemplate: RuleTemplate = {
      id: uuidv4(),
      friendlyId,
      name,
      description: description || '',
      enabled: true,
      priority: cache.templates.length + 1,
      expression,
      action,
      actionParameters: actionParameters || {},
      tags: tags || [],
      applicableTags: applicableTags || [],
      excludedDomains: excludedDomains || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    console.log('[Security Rules POST] Creating new template:', {
      id: newTemplate.id,
      friendlyId: newTemplate.friendlyId,
      name: newTemplate.name,
      version: newTemplate.version
    });

    cache.templates.push(newTemplate);
    console.log(`[Security Rules POST] Total templates before save: ${cache.templates.length}`);

    await saveRulesCache(cache);
    console.log('[Security Rules POST] ✅ Template created and saved successfully');

    return NextResponse.json({
      success: true,
      data: newTemplate
    });
  } catch (error) {
    console.error('Error creating security rule:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create security rule'
    }, { status: 500 });
  }
}

// PUT - Actualizar plantilla existente
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, expression, action, actionParameters, tags, applicableTags, excludedDomains, enabled } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Rule ID is required'
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
    
    // Increment version for significant changes
    let newVersion = existingTemplate.version;
    if (expression !== existingTemplate.expression || action !== existingTemplate.action) {
      const versionParts = existingTemplate.version.split('.');
      versionParts[1] = String(parseInt(versionParts[1]) + 1);
      newVersion = versionParts.join('.');
    }

    const updatedTemplate: RuleTemplate = {
      ...existingTemplate,
      name: name || existingTemplate.name,
      description: description || existingTemplate.description,
      expression: expression || existingTemplate.expression,
      action: action || existingTemplate.action,
      actionParameters: actionParameters || existingTemplate.actionParameters,
      tags: tags || existingTemplate.tags,
      applicableTags: applicableTags || existingTemplate.applicableTags,
      excludedDomains: excludedDomains || existingTemplate.excludedDomains,
      enabled: enabled !== undefined ? enabled : existingTemplate.enabled,
      updatedAt: new Date().toISOString(),
      version: newVersion
    };

    console.log('[Security Rules PUT] Updating template:', {
      id: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      name: updatedTemplate.name,
      oldVersion: existingTemplate.version,
      newVersion: updatedTemplate.version
    });

    cache.templates[templateIndex] = updatedTemplate;
    console.log(`[Security Rules PUT] Total templates before save: ${cache.templates.length}`);

    await saveRulesCache(cache);
    console.log('[Security Rules PUT] ✅ Template updated and saved successfully');

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

// DELETE - Eliminar plantilla
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Rule ID is required'
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

    const deletedTemplate = cache.templates.splice(templateIndex, 1)[0];
    console.log('[Security Rules DELETE] Deleting template:', {
      id: deletedTemplate.id,
      friendlyId: deletedTemplate.friendlyId,
      name: deletedTemplate.name
    });
    console.log(`[Security Rules DELETE] Total templates before save: ${cache.templates.length}`);

    await saveRulesCache(cache);
    console.log('[Security Rules DELETE] ✅ Template deleted and saved successfully');

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