// Test script to verify EUR-JPY effective rate calculation
const { convertToJPY } = require('./src/utils/yahooFinanceApi');

// Mock position data similar to the EUR Apple position
const eurPosition = {
    transactionDate: "2008/12/12",
    ticker: "AAPL",
    fullName: "Apple",
    broker: "CreditAgricole",
    account: "General",
    quantity: 392,
    costPerUnit: 2.63,
    baseCcy: "EUR",
    transactionFx: 1.3348,
    fxPair: "EUR/USD"
};

async function testCalculation() {
    console.log('Testing EUR-JPY effective rate calculation...');
    console.log('Expected calculation: 1.3348 (EUR/USD) * 90.65 (USD/JPY) = 120.99962');
    
    try {
        const result = await convertToJPY(
            eurPosition.quantity * eurPosition.costPerUnit,
            eurPosition,
            true // historical
        );
        
        console.log('\nResult:');
        console.log('Converted amount:', result.convertedAmount);
        console.log('Effective rate:', result.effectiveRate);
        console.log('Individual rates:', result.rates);
        
        console.log('\nExpected effective rate: 120.99962');
        console.log('Actual effective rate:', result.effectiveRate);
        console.log('Match?', Math.abs(result.effectiveRate - 120.99962) < 0.001);
        
    } catch (error) {
        console.error('Error testing calculation:', error);
    }
}

testCalculation();
