import React from 'react';
import { Text } from 'ink';
import { renderBanner } from './renderer.js';
import type { ColorMode } from './types.js';

export interface BannerProps {
  width: number;
  height?: number;
  colorMode?: ColorMode;
}

export const Banner: React.FC<BannerProps> = ({ width, height, colorMode }) => {
  const content = renderBanner({ width, height, colorMode });
  if (!content) {
    return null;
  }
  return <Text>{content}</Text>;
};
