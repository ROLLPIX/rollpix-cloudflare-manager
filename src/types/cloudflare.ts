export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

export interface CloudflareDNSRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  meta: {
    auto_added: boolean;
    managed_by_apps: boolean;
    managed_by_argo_tunnel: boolean;
    source: string;
  };
  comment?: string;
  tags: string[];
  created_on: string;
  modified_on: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: number;
    message: string;
  }>;
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
    total_pages: number;
  };
}

export interface DomainStatus {
  domain: string;
  zoneId: string;
  rootRecord?: CloudflareDNSRecord;
  wwwRecord?: CloudflareDNSRecord;
  rootProxied: boolean;
  wwwProxied: boolean;
}