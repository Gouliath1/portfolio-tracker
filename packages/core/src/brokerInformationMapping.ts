export interface BrokerInfo {
  name: string;
  country: string;
  countryCode: string;
  flag: string; // Emoji flag
}

const BROKER_INFO: Record<string, BrokerInfo> = {
  Rakuten: {
    name: 'Rakuten Securities',
    country: 'Japan',
    countryCode: 'JP',
    flag: '🇯🇵'
  },
  CreditAgricole: {
    name: 'Crédit Agricole',
    country: 'France',
    countryCode: 'FR',
    flag: '🇫🇷'
  }
};

export const getBrokerInfo = (brokerName?: string): BrokerInfo | null => {
  if (!brokerName) {
    return null;
  }
  return BROKER_INFO[brokerName] || null;
};

export const formatBrokerDisplay = (brokerName?: string): string => {
  if (!brokerName) {
    return 'Unknown';
  }
  const brokerInfo = getBrokerInfo(brokerName);
  if (brokerInfo) {
    return `${brokerInfo.flag} ${brokerInfo.name}`;
  }
  return brokerName;
};
