# Testing Framework Documentation

## Overview

This portfolio tracker uses Jest and React Testing Library for comprehensive unit and integration testing. The testing framework is designed to be:

- **Organized**: Tests are separated by type (utils, components, api)
- **Maintainable**: Common mocks and utilities are centralized
- **Reliable**: Tests run in isolation with proper setup/teardown
- **Fast**: Mocked dependencies and efficient test patterns

## Directory Structure

```
__tests__/
├── __mocks__/          # Shared mocks and test utilities
│   ├── mockData.ts     # Mock data for positions, prices, etc.
│   └── testUtils.ts    # Custom render functions and helpers
├── components/         # Component tests
│   └── *.test.tsx      # React component tests
├── utils/              # Utility function tests
│   └── *.test.ts       # Pure function tests
└── api/                # API route tests (future)
    └── *.test.ts       # API endpoint tests
```

## Test Scripts

```bash
# Run all tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests for CI/CD (no watch, with coverage)
npm run test:ci
```

## Test Types

### 1. Utility Tests (`__tests__/utils/`)

Test pure functions and business logic:
- Portfolio calculations
- Currency conversions
- Data transformations
- Validation functions

**Example**: `calculations.test.ts`
```typescript
describe('calculatePosition', () => {
  it('should calculate USD position correctly', async () => {
    const result = await calculatePosition(rawPosition, 160.0)
    expect(result.currentValueJPY).toBeGreaterThan(0)
  })
})
```

### 2. Component Tests (`__tests__/components/`)

Test React components in isolation:
- Rendering with different props
- User interactions
- State changes
- Error boundaries

**Example**: `PortfolioSummary.test.tsx`
```typescript
describe('PortfolioSummary Component', () => {
  it('should render portfolio data correctly', () => {
    render(<PortfolioSummary summary={mockSummary} />)
    expect(screen.getByTestId('total-value')).toBeDefined()
  })
})
```

### 3. API Tests (`__tests__/api/`) - Future

Test API routes and endpoints:
- Request/response handling
- Error cases
- Authentication
- Data validation

## Mock Strategy

### Data Mocks (`__mocks__/mockData.ts`)

Centralized mock data for:
- Portfolio positions
- Stock prices
- FX rates
- API responses

### API Mocks

External APIs are mocked:
- Yahoo Finance API
- Fetch requests
- Next.js router

### Component Mocks

Heavy components are mocked:
- Chart.js components
- External libraries

## Testing Best Practices

### 1. Test Structure

Follow the AAA pattern:
```typescript
it('should calculate portfolio value', () => {
  // Arrange
  const positions = mockPositions
  
  // Act
  const result = calculatePortfolioValue(positions)
  
  // Assert
  expect(result.totalValue).toBe(expectedValue)
})
```

### 2. Descriptive Test Names

- Use "should" statements
- Describe the expected behavior
- Include context when needed

```typescript
// Good
it('should calculate position PnL correctly for USD stocks')
it('should handle null prices gracefully')
it('should format large JPY amounts without decimals')

// Bad
it('tests position calculation')
it('price test')
```

### 3. Test Edge Cases

Always test:
- Null/undefined inputs
- Empty arrays/objects
- Zero values
- Large numbers
- Negative values
- API failures

### 4. Isolated Tests

Each test should:
- Be independent
- Not rely on external state
- Clean up after itself
- Use fresh mock data

## Coverage Goals

Target coverage thresholds:
- **Statements**: 70%
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%

Focus on:
1. Business logic (calculations, transformations)
2. Component rendering and interactions
3. Error handling
4. Edge cases

## Common Patterns

### Testing Async Functions

```typescript
it('should fetch position data', async () => {
  mockFetchOnce(mockPositions)
  
  const result = await fetchPositions()
  
  expect(result).toEqual(mockPositions)
})
```

### Testing Error Cases

```typescript
it('should handle API errors gracefully', async () => {
  mockFetch.mockRejectedValueOnce(new Error('API failed'))
  
  await expectAsyncToThrow(() => fetchPositions(), 'API failed')
})
```

### Testing Components with Props

```typescript
it('should render loading state', () => {
  render(<PortfolioSummary summary={null} />)
  
  expect(screen.getByTestId('loading')).toBeDefined()
})
```

## Running Tests

### Development

```bash
# Start watch mode for active development
npm run test:watch

# Run specific test file
npm test calculations.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="portfolio"
```

### Build Integration

Tests automatically run during build:
```bash
npm run build  # Runs tests first, then builds
```

### CI/CD

```bash
npm run test:ci  # No watch, with coverage for CI
```

## Future Enhancements

1. **API Testing**: Add tests for Next.js API routes
2. **E2E Testing**: Consider Playwright for end-to-end tests
3. **Performance Testing**: Add performance benchmarks
4. **Visual Testing**: Consider snapshot testing for UI components
5. **Integration Testing**: Test component interactions

## Troubleshooting

### Common Issues

1. **Mock not working**: Check if module is properly mocked in `jest.setup.js`
2. **Async test failing**: Ensure proper `await` and promise handling
3. **Component not rendering**: Check if all required props are provided
4. **Coverage low**: Add tests for untested branches and edge cases

### Debug Tips

```bash
# Run single test with verbose output
npm test -- --verbose calculations.test.ts

# Debug specific test
npm test -- --testNamePattern="should calculate" --verbose
```

This testing framework provides a solid foundation for maintaining code quality and catching regressions as the portfolio tracker evolves.
