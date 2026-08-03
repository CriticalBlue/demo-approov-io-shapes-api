import { jest } from '@jest/globals';

describe('device register', () => {
  let registerDeviceWithValue;
  let getDeviceValue;

  beforeEach(async () => {
    jest.resetModules();
    ({ registerDeviceWithValue, getDeviceValue } = await import('../server/device-register.js'));
  });

  test('handles object prototype property names as ordinary device IDs', () => {
    expect(registerDeviceWithValue('hasOwnProperty', { pass: true })).toBe(true);
    expect(registerDeviceWithValue('__proto__', { pass: true })).toBe(true);
    expect(registerDeviceWithValue('next-device', { pass: true })).toBe(true);

    expect(getDeviceValue('hasOwnProperty')).toEqual({ pass: true });
    expect(getDeviceValue('__proto__')).toEqual({ pass: true });
  });

  test('rejects missing device IDs', () => {
    expect(registerDeviceWithValue(undefined, { pass: true })).toBe(false);
    expect(registerDeviceWithValue('', { pass: true })).toBe(false);
  });

  test('evicts the oldest device when adding beyond the 100-device limit', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(registerDeviceWithValue(`device-${index}`, { pass: true })).toBe(true);
    }

    expect(getDeviceValue('device-0')).not.toBeNull();
    expect(registerDeviceWithValue('device-100', { pass: true })).toBe(true);
    expect(getDeviceValue('device-0')).toBeNull();
    expect(getDeviceValue('device-1')).not.toBeNull();
    expect(getDeviceValue('device-100')).not.toBeNull();
  });
});
