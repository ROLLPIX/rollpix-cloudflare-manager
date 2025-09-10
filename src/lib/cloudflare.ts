import { CloudflareZone, CloudflareDNSRecord, CloudflareApiResponse, DomainStatus } from '@/types/cloudflare';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareAPI {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<CloudflareApiResponse<T>> {
    const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Cloudflare API error (${response.status}):`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getZones(page: number = 1, perPage: number = 50): Promise<{ zones: CloudflareZone[], totalCount: number, totalPages: number }> {
    const response = await this.makeRequest<CloudflareZone[]>(`/zones?page=${page}&per_page=${perPage}`);
    return {
      zones: response.result,
      totalCount: response.result_info?.total_count || 0,
      totalPages: response.result_info?.total_pages || 1
    };
  }

  async getDNSRecords(zoneId: string, page: number = 1, perPage: number = 100): Promise<{ records: CloudflareDNSRecord[], totalCount: number }> {
    const response = await this.makeRequest<CloudflareDNSRecord[]>(`/zones/${zoneId}/dns_records?page=${page}&per_page=${perPage}`);
    return {
      records: response.result,
      totalCount: response.result_info?.total_count || 0
    };
  }

  async updateDNSRecord(zoneId: string, recordId: string, proxied: boolean): Promise<CloudflareDNSRecord> {
    const response = await this.makeRequest<CloudflareDNSRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ proxied }),
    });
    return response.result;
  }

  async getDomainStatuses(page: number = 1, perPage: number = 20): Promise<{ domains: DomainStatus[], totalCount: number, totalPages: number }> {
    const zonesResponse = await this.getZones(page, perPage);
    const domainStatuses: DomainStatus[] = [];

    for (const zone of zonesResponse.zones) {
      const recordsResponse = await this.getDNSRecords(zone.id);
      const records = recordsResponse.records;
      
      // Look for both A and CNAME records for root and www
      const rootRecord = records.find(record => 
        record.name === zone.name && (record.type === 'A' || record.type === 'CNAME')
      );
      
      const wwwRecord = records.find(record => 
        record.name === `www.${zone.name}` && (record.type === 'A' || record.type === 'CNAME')
      );

      domainStatuses.push({
        domain: zone.name,
        zoneId: zone.id,
        rootRecord,
        wwwRecord,
        rootProxied: rootRecord?.proxied || false,
        wwwProxied: wwwRecord?.proxied || false,
      });
    }

    return {
      domains: domainStatuses,
      totalCount: zonesResponse.totalCount,
      totalPages: zonesResponse.totalPages
    };
  }

  async toggleProxy(zoneId: string, recordId: string, proxied: boolean): Promise<CloudflareDNSRecord> {
    return this.updateDNSRecord(zoneId, recordId, proxied);
  }
}