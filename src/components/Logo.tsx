import React from 'react';
import { Image, View } from 'react-native';

type LogoProps = {
  size?: number;
};

// logo.png = 2167×2124 (icon + text blended)
// wordmark.png = 2167×439 (exact text to use)
// Icon-only portion height in original = 2124 - 439 = 1685px
const W = 2167;
const H_FULL = 2124;
const H_WORD = 439;
const H_ICON = H_FULL - H_WORD; // 1685

export function Logo({ size = 64 }: LogoProps) {
  const iconH = size * (H_ICON / W);
  const fullH = size * (H_FULL / W);
  const wordH = size * (H_WORD / W);

  return (
    <View style={{ width: size }}>
      {/* Clip logo.png to show only the icon (pin + cadenas), hiding the blended text below */}
      <View style={{ width: size, height: iconH, overflow: 'hidden' }}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={{ width: size, height: fullH }}
          resizeMode="stretch"
        />
      </View>
      {/* Exact wordmark from 1 - Copie.png */}
      <Image
        source={require('../../assets/images/wordmark.png')}
        style={{ width: size, height: wordH }}
        resizeMode="stretch"
      />
    </View>
  );
}
