import React from 'react';
import { Image } from 'react-native';

type LogoProps = {
  size?: number;
};

// logo.png = 2167×2124 (icon + SECULIV text)
const ASPECT = 2124 / 2167;

export function Logo({ size = 64 }: LogoProps) {
  return (
    <Image
      source={require('../../assets/images/logo.png')}
      style={{ width: size, height: size * ASPECT }}
      resizeMode="contain"
    />
  );
}
