import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState, NativeModules } from 'react-native';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
const config = {
  automatic: true,
  active: false,
  currentSlot: 'afternoon',
  slots: ['morning', 'afternoon', 'evening', 'night'].map(key => ({
    key,
    uri: `file:///${key}.png`,
    custom: false,
  })),
};
const api = {
  getConfig: jest.fn().mockResolvedValue(config),
  pickImage: jest.fn().mockResolvedValue(null),
  resetImage: jest.fn(),
  setAutomatic: jest.fn().mockResolvedValue({ ...config, automatic: false }),
  openWallpaperPicker: jest.fn().mockResolvedValue(undefined),
};
NativeModules.DaylightWallpaper = api;
const { default: App, nextRefreshDelay } = require('../App');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

test('previews all four moments, imports into the selected slot, and opens the native wallpaper picker', async () => {
  let screen: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    screen = ReactTestRenderer.create(<App />);
  });
  const button = (label: string) =>
    screen!.root.findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )[0];
  expect(
    Array.from(
      new Set(
        screen!.root
          .findAll(node =>
            node.props.accessibilityLabel?.startsWith('Preview '),
          )
          .map(node => node.props.accessibilityLabel),
      ),
    ),
  ).toHaveLength(4);
  await act(async () => {
    button('Preview Night').props.onPress();
  });
  await act(async () => {
    button('Choose night photo').props.onPress();
  });
  expect(api.pickImage).toHaveBeenCalledWith('night');
  await act(async () => {
    button('Daily schedule').props.onPress();
  });
  expect(button('Edit Morning wallpaper')).toBeDefined();
  await act(async () => {
    button('Edit Evening wallpaper').props.onPress();
  });
  expect(button('Choose evening photo')).toBeDefined();
  await act(async () => {
    button('Set as wallpaper').props.onPress();
  });
  expect(api.openWallpaperPicker).toHaveBeenCalledTimes(1);
  await act(async () => {
    screen!.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Automatic wallpaper changes' &&
          typeof node.props.onValueChange === 'function',
      )[0]
      .props.onValueChange(false);
  });
  expect(api.setAutomatic).toHaveBeenCalledWith(false);
  await act(async () => {
    screen!.unmount();
  });
});

test('refreshes at a boundary, stops its timer in the background, and catches up when reopened', async () => {
  jest.setSystemTime(new Date(2026, 9, 17, 11, 59, 59));
  const listener = jest.spyOn(AppState, 'addEventListener');
  let screen: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    screen = ReactTestRenderer.create(<App />);
  });
  expect(api.getConfig).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(api.getConfig).toHaveBeenCalledTimes(2);
  const onState = listener.mock.calls[0][1];
  await act(async () => {
    onState('background');
    jest.advanceTimersByTime(12 * 60 * 60 * 1000);
  });
  expect(api.getConfig).toHaveBeenCalledTimes(2);
  await act(async () => {
    onState('active');
  });
  expect(api.getConfig).toHaveBeenCalledTimes(3);
  await act(async () => {
    screen!.unmount();
  });
  listener.mockRestore();
});

test('foreground refresh uses the next local boundary, including midnight rollover', () => {
  expect(nextRefreshDelay(new Date(2026, 9, 17, 5, 59, 59))).toBe(1000);
  expect(nextRefreshDelay(new Date(2026, 9, 17, 6))).toBe(6 * 3600000);
  expect(nextRefreshDelay(new Date(2026, 9, 17, 12))).toBe(6 * 3600000);
  expect(nextRefreshDelay(new Date(2026, 9, 17, 18))).toBe(3 * 3600000);
  expect(nextRefreshDelay(new Date(2026, 9, 17, 21))).toBe(9 * 3600000);
});
