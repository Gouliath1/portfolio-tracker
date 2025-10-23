export interface BrokerInfo {
    name: string;
    country: string;
    countryCode: string;
    flag: string;
}
export declare const getBrokerInfo: (brokerName?: string) => BrokerInfo | null;
export declare const formatBrokerDisplay: (brokerName?: string) => string;
