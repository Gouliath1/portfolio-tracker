const BROKER_INFO = {
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
export const getBrokerInfo = (brokerName) => {
    if (!brokerName) {
        return null;
    }
    return BROKER_INFO[brokerName] || null;
};
export const formatBrokerDisplay = (brokerName) => {
    if (!brokerName) {
        return 'Unknown';
    }
    const brokerInfo = getBrokerInfo(brokerName);
    if (brokerInfo) {
        return `${brokerInfo.flag} ${brokerInfo.name}`;
    }
    return brokerName;
};
