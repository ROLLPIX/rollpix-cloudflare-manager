'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DomainStatus } from '@/types/cloudflare';

interface DNSPillsProps {
  domain: DomainStatus;
  onToggleProxy?: (zoneId: string, recordId: string, currentProxied: boolean) => Promise<void>;
  updatingRecords?: Set<string>;
}

export function DNSPills({ domain, onToggleProxy, updatingRecords }: DNSPillsProps) {
  const getRootPillColor = () => {
    const isUpdating = updatingRecords?.has(`${domain.zoneId}-${domain.rootRecord?.id}`);
    if (isUpdating) return 'bg-yellow-500 hover:bg-yellow-600';
    if (!domain.rootRecord) return 'bg-gray-400 hover:bg-gray-500';
    return domain.rootProxied ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';
  };

  const getWWWPillColor = () => {
    const isUpdating = updatingRecords?.has(`${domain.zoneId}-${domain.wwwRecord?.id}`);
    if (isUpdating) return 'bg-yellow-500 hover:bg-yellow-600';
    if (!domain.wwwRecord) return 'bg-gray-400 hover:bg-gray-500';
    return domain.wwwProxied ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';
  };

  const getRootState = () => {
    const isUpdating = updatingRecords?.has(`${domain.zoneId}-${domain.rootRecord?.id}`);
    if (isUpdating) return `${domain.rootProxied ? 'Deshabilitando' : 'Habilitando'} proxy...`;
    if (!domain.rootRecord) return 'Inexistente';
    return domain.rootProxied ? 'Con proxy' : 'Solo DNS';
  };

  const getWWWState = () => {
    const isUpdating = updatingRecords?.has(`${domain.zoneId}-${domain.wwwRecord?.id}`);
    if (isUpdating) return `${domain.wwwProxied ? 'Deshabilitando' : 'Habilitando'} proxy...`;
    if (!domain.wwwRecord) return 'Inexistente';
    return domain.wwwProxied ? 'Con proxy' : 'Solo DNS';
  };

  return (
    <TooltipProvider>
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!domain.rootRecord || updatingRecords?.has(`${domain.zoneId}-${domain.rootRecord?.id}`)}
              onClick={() => {
                if (domain.rootRecord && onToggleProxy) {
                  onToggleProxy(domain.zoneId, domain.rootRecord.id, domain.rootProxied);
                }
              }}
              className={`text-white text-xs h-6 px-2 ${getRootPillColor()} border-0 rounded-full`}
            >
              @
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getRootState()} {domain.rootRecord ? `(${domain.rootRecord.type})` : ''}</p>
            {domain.rootRecord && <p className="text-xs opacity-75">Click para cambiar proxy</p>}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!domain.wwwRecord || updatingRecords?.has(`${domain.zoneId}-${domain.wwwRecord?.id}`)}
              onClick={() => {
                if (domain.wwwRecord && onToggleProxy) {
                  onToggleProxy(domain.zoneId, domain.wwwRecord.id, domain.wwwProxied);
                }
              }}
              className={`text-white text-xs h-6 px-2 ${getWWWPillColor()} border-0 rounded-full`}
            >
              www
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getWWWState()} {domain.wwwRecord ? `(${domain.wwwRecord.type})` : ''}</p>
            {domain.wwwRecord && <p className="text-xs opacity-75">Click para cambiar proxy</p>}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}