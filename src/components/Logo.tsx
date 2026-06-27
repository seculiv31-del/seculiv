import React from 'react';
import { Image } from 'react-native';

type LogoProps = {
  size?: number;
};

// logo-blanc.png = 2167×1685 (cadenas seul)
const ASPECT = 1685 / 2167;

export function Logo({ size = 64 }: LogoProps) {
  return (
    <Image
      source={require('../../assets/images/logo-blanc.png')}
      style={{ width: size, height: size * ASPECT }}
      resizeMode="contain"
    />
  );
}
