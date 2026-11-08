// 출처: https://github.com/faisalman/ua-parser-js
import { UAParser } from 'ua-parser-js';
import { readVariable, saveVariable } from './github';

const SLOT_PATTERN = /^WEB_PUSH_SUB_([1-8])$/;
export function deviceNameVariable(slot: string): string {
  if (slot === 'WEB_PUSH_SUBSCRIPTION') return 'PUSH_DEVICE_NAME_LEGACY';
  const match = SLOT_PATTERN.exec(slot);
  if (!match) throw new Error('기기 등록 정보를 다시 확인해 주세요');
  return `PUSH_DEVICE_NAME_${match[1]}`;
}

export function validDeviceName(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 40 && !/[\x00-\x1f\x7f]/.test(value);
}

export async function loadDeviceNames(repo: string, token: string, slots: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(slots.map(async (slot) => {
    const name = await readVariable(repo, token, deviceNameVariable(slot));
    return [slot, name && validDeviceName(name) ? name.trim() : ''] as const;
  }));
  return Object.fromEntries(entries.filter(([, name]) => name));
}

export async function saveDeviceName(repo: string, token: string, slot: string, name: string): Promise<void> {
  if (!validDeviceName(name)) throw new Error('기기 이름을 40자 이내로 적어 주세요');
  await saveVariable(repo, token, deviceNameVariable(slot), name.trim());
}

export async function suggestDeviceName(): Promise<string> {
  const parser = new UAParser();
  let device = parser.getDevice();
  try { device = await device.withClientHints(); } catch { /* 모델을 제공하지 않으면 기기 종류를 쓴다 */ }
  const model = device.model?.trim();
  if (model && model !== 'K' && validDeviceName(model)) return model;
  const os = parser.getOS().name ?? '';
  if (os === 'iOS') return device.type === 'tablet' ? 'iPad' : 'iPhone';
  if (os === 'Android') return device.type === 'tablet' ? '안드로이드 태블릿' : '안드로이드 휴대폰';
  if (os === 'Windows') return 'Windows PC';
  if (os === 'macOS') return 'Mac';
  return device.type === 'mobile' ? '휴대폰' : device.type === 'tablet' ? '태블릿' : 'PC';
}

/** 같은 이름이 둘 이상이면 칸 순서대로 "이름 (1)", "이름 (2)"로 보여 준다. 저장된 이름은 그대로 둔다. */
export function displayDeviceName(slot: string, names: Record<string, string>): string {
  const name = names[slot];
  if (!name) return '';
  const rank = (key: string) => (key === 'WEB_PUSH_SUBSCRIPTION' ? 99 : Number(key.slice(-1)));
  const same = Object.keys(names).filter((key) => names[key] === name).sort((a, b) => rank(a) - rank(b));
  return same.length > 1 ? `${name} (${same.indexOf(slot) + 1})` : name;
}

/** 자동으로 알아낸 기기 이름. */
export async function chooseDeviceName(): Promise<string> {
  return (await suggestDeviceName()).trim();
}
