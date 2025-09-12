'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DomainStatus } from '@/types/cloudflare';

interface DNSPillsProps {
  domain: DomainStatus;
}

export function DNSPills({ domain }: DNSPillsProps) {
  const getRootPillColor = () => {
    if (!domain.rootRecord) return 'bg-gray-400 hover:bg-gray-500';
    return domain.rootProxied ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';
  };

  const getWWWPillColor = () => {
    if (!domain.wwwRecord) return 'bg-gray-400 hover:bg-gray-500';
    return domain.wwwProxied ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';
  };

  const getRootState = () => {
    if (!domain.rootRecord) return 'Inexistente';
    return domain.rootProxied ? 'Con proxy' : 'Solo DNS';
  };

  const getWWWState = () => {
    if (!domain.wwwRecord) return 'Inexistente';
    return domain.wwwProxied ? 'Con proxy' : 'Solo DNS';
  };

  return (
    <TooltipProvider>
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className={`text-white text-xs ${getRootPillColor()} border-0`}
            >
              @
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getRootState()} {domain.rootRecord ? `(${domain.rootRecord.type})` : ''}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className={`text-white text-xs ${getWWWPillColor()} border-0`}
            >
              www
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getWWWState()} {domain.wwwRecord ? `(${domain.wwwRecord.type})` : ''}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}