'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Siren, Bot } from 'lucide-react';
import { DomainStatus } from '@/types/cloudflare';

interface FirewallControlsProps {
  domain: DomainStatus;
  onToggleUnderAttack?: (zoneId: string, enabled: boolean) => Promise<void>;
  onToggleBotFight?: (zoneId: string, enabled: boolean) => Promise<void>;
  isUpdating?: boolean;
}

export function FirewallControls({ 
  domain, 
  onToggleUnderAttack, 
  onToggleBotFight,
  isUpdating = false 
}: FirewallControlsProps) {
  return (
    <TooltipProvider>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleUnderAttack?.(domain.zoneId, !domain.underAttackMode)}
              disabled={isUpdating}
              className={`w-8 h-8 p-0 ${
                domain.underAttackMode 
                  ? 'text-red-500 hover:text-red-600' 
                  : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Siren className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Under Attack Mode: {domain.underAttackMode ? 'Activo' : 'Inactivo'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleBotFight?.(domain.zoneId, !domain.botFightMode)}
              disabled={isUpdating}
              className={`w-8 h-8 p-0 ${
                domain.botFightMode 
                  ? 'text-blue-500 hover:text-blue-600' 
                  : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Bot className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Bot Fight Mode: {domain.botFightMode ? 'Activo' : 'Inactivo'}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}