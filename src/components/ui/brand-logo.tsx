'use client';

import React, { useState } from 'react';
import { LOGO_DATA_URI, ICON_DATA_URI } from '@/lib/assets/brand-assets';

export interface BrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  variant?: 'horizontal' | 'icon';
}

/**
 * Universal Brand Logo component for Radha Krishna HMS.
 * Features built-in zero-latency embedded fallback so the logo ALWAYS displays,
 * even when offline, during network timeouts, or in print dialogs.
 */
export function BrandLogo({
  className,
  alt = 'Radha Krishna HMS by opti-x.in',
  variant = 'horizontal',
  ...props
}: BrandLogoProps) {
  const defaultSrc = variant === 'icon' ? '/icon.png' : '/logo.png';
  const fallbackSrc = variant === 'icon' ? ICON_DATA_URI : LOGO_DATA_URI;
  const [src, setSrc] = useState(defaultSrc);

  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="sync"
      fetchPriority="high"
      onError={() => {
        if (src !== fallbackSrc) {
          setSrc(fallbackSrc);
        }
      }}
      className={className}
      {...props}
    />
  );
}

export { LOGO_DATA_URI, ICON_DATA_URI };
