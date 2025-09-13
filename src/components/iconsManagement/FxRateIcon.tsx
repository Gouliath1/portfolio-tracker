import Image from 'next/image';

interface FxRateIconProps {
  currencyPair: string;
  className?: string;
}

export function FxRateIcon({ currencyPair, className = "" }: FxRateIconProps) {
  // Map currency pairs to icon files
  const getIconPath = (pair: string): string => {
    switch (pair.toUpperCase()) {
      case 'EURJPY':
        return '/icons/Icon_EURJPY.png';
      case 'USDJPY':
        return '/icons/Icon_USDJPY.png';
      default:
        // Fallback to a generic chart emoji if no specific icon exists
        return '';
    }
  };

  const iconPath = getIconPath(currencyPair);

  if (!iconPath) {
    // Fallback to emoji if no icon found
    return <span className={className}>📊</span>;
  }

  return (
    <Image
      src={iconPath}
      alt={`${currencyPair} icon`}
      width={24}
      height={24}
      className={`${className} object-contain`}
      style={{ margin: 0, padding: 0 }}
    />
  );
}