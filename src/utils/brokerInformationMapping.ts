export interface BrokerInfo {
    name: string;
    country: string;
    countryCode: string;
    flag: string; // Emoji flag
}

export const BROKER_INFO: Record<string, BrokerInfo> = {
    'Rakuten': {
        name: 'Rakuten Securities',
        country: 'Japan',
        countryCode: 'JP',
        flag: '🇯🇵'
    },
    'CreditAgricole': {
        name: 'Crédit Agricole',
        country: 'France',
        countryCode: 'FR',
        flag: '🇫🇷'
    }
};

export function getBrokerInfo(brokerName: string | undefined): BrokerInfo | null {
    if (!brokerName) return null;
    return BROKER_INFO[brokerName] || null;
}

export function formatBrokerDisplay(brokerName: string | undefined): string {
    if (!brokerName) return 'Unknown';
    const brokerInfo = getBrokerInfo(brokerName);
    if (brokerInfo) {
        return `${brokerInfo.flag} ${brokerInfo.name}`;
    }
    return brokerName;
}
