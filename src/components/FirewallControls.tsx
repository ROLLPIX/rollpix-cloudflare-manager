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
  updatingUnderAttack?: boolean;
  updatingBotFight?: boolean;
}

export function FirewallControls({
  domain,
  onToggleUnderAttack,
  onToggleBotFight,
  isUpdating = false,
  updatingUnderAttack = false,
  updatingBotFight = false
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
              disabled={isUpdating || updatingUnderAttack}
              className={`w-8 h-8 p-0 ${
                updatingUnderAttack
                  ? 'text-yellow-500'
                  : domain.underAttackMode
                    ? 'text-red-500 hover:text-red-600'
                    : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Siren className={`h-5 w-5 ${updatingUnderAttack ? 'animate-pulse' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {updatingUnderAttack
                ? `${domain.underAttackMode ? 'Deshabilitando' : 'Habilitando'} Under Attack Mode...`
                : `Under Attack Mode: ${domain.underAttackMode ? 'Activo' : 'Inactivo'}`
              }
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleBotFight?.(domain.zoneId, !domain.botFightMode)}
              disabled={isUpdating || updatingBotFight}
              className={`w-8 h-8 p-0 ${
                updatingBotFight
                  ? 'text-yellow-500'
                  : domain.botFightMode
                    ? 'text-red-500 hover:text-red-600'
                    : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Bot className={`h-5 w-5 ${updatingBotFight ? 'animate-pulse' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {updatingBotFight
                ? `${domain.botFightMode ? 'Deshabilitando' : 'Habilitando'} Bot Fight Mode...`
                : `Bot Fight Mode: ${domain.botFightMode ? 'Activo' : 'Inactivo'}`
              }
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}