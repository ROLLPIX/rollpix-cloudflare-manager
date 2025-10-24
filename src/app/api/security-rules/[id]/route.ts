import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { RuleTemplate } from '@/types/cloudflare';

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

    console.log('[Security Rules [id]] 💾 Saving rules cache...');
    console.log(`[Security Rules [id]] File path: ${RULES_CACHE_FILE}`);
    console.log(`[Security Rules [id]] Templates count: ${cache.templates.length}`);
    console.log(`[Security Rules [id]] Data size: ${jsonData.length} bytes`);

    // Check if directory exists
    const cacheDir = path.dirname(RULES_CACHE_FILE);
    try {
      await fs.access(cacheDir);
      console.log(`[Security Rules [id]] ✅ Cache directory exists: ${cacheDir}`);
    } catch (error) {
      console.log(`[Security Rules [id]] ⚠️ Cache directory does not exist, creating: ${cacheDir}`);
      await fs.mkdir(cacheDir, { recursive: true });
      console.log(`[Security Rules [id]] ✅ Cache directory created`);
    }

    // Write file
    await fs.writeFile(RULES_CACHE_FILE, jsonData, 'utf-8');
    console.log(`[Security Rules [id]] ✅ Rules cache saved successfully`);

    // Verify write
    const verifyData = await fs.readFile(RULES_CACHE_FILE, 'utf-8');
    const verifyParsed = JSON.parse(verifyData);
    console.log(`[Security Rules [id]] ✅ Verification: ${verifyParsed.templates.length} templates in file`);

    if (verifyParsed.templates.length !== cache.templates.length) {
      console.error(`[Security Rules [id]] ❌ MISMATCH: Expected ${cache.templates.length}, got ${verifyParsed.templates.length}`);
      throw new Error('Template count mismatch after save');
    }
  } catch (error) {
    console.error('[Security Rules [id]] ❌ Error saving rules cache:', error);
    console.error('[Security Rules [id]] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      path: RULES_CACHE_FILE,
      templatesCount: cache.templates.length
    });
    throw error;
  }
}

// PUT - Actualizar plantilla específica
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    console.log('[Security Rules [id] PUT] Updating template:', {
      id: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      name: updatedTemplate.name,
      oldVersion: existingTemplate.version,
      newVersion: updatedTemplate.version
    });

    cache.templates[templateIndex] = updatedTemplate;
    console.log(`[Security Rules [id] PUT] Total templates before save: ${cache.templates.length}`);

    await saveRulesCache(cache);
    console.log('[Security Rules [id] PUT] ✅ Template updated and saved successfully');

    // Return version change flag so client can handle cache invalidation
    const versionChanged = newVersion !== existingTemplate.version;
    if (versionChanged) {
      console.log(`[SecurityRules] Template ${id} version changed from ${existingTemplate.version} to ${newVersion}, client should invalidate cache`);
    }

    return NextResponse.json({
      success: true,
      data: updatedTemplate,
      versionChanged
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
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

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