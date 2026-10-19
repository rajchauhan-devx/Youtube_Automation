import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'sun'
  | 'sunrise'
  | 'sunset'
  | 'moon'
  | 'clock'
  | 'image'
  | 'arrow'
  | 'check'
  | 'leaf'
  | 'close'
  | 'grid';
const paths: Record<IconName, string> = {
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42',
  sunrise:
    'M3 18h18M5 22h14M5 14a7 7 0 0 1 14 0M12 2v3M3 6l2 2m16-2-2 2M1 14h2m18 0h2',
  sunset:
    'M3 18h18M5 22h14M5 14a7 7 0 0 1 14 0M12 2v5m-2-2 2 2 2-2M3 6l2 2m16-2-2 2M1 14h2m18 0h2',
  moon: 'M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z',
  clock: 'M12 7v5l3 2',
  image:
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 17l5-5 4 4 3-3 6 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  leaf: 'M20 3C10 2 3 7 4 14s12 9 16-11ZM4 21 15 10',
  close: 'm6 6 12 12M6 18 18 6',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
};
export default function Icon({
  name,
  size = 20,
  color = '#F4F5F7',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
      {name === 'sun' ? <Circle cx={12} cy={12} r={4} /> : null}
      {name === 'clock' ? <Circle cx={12} cy={12} r={9} /> : null}
      {name === 'image' ? <Circle cx={8.5} cy={8} r={1.5} /> : null}
    </Svg>
  );
}
