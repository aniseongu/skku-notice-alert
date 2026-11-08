import { DEVICE_SLOTS, browserPushEnabled, currentDeviceSlot, matchesCurrentDevice } from './browser-push';
import { deviceNameVariable, loadDeviceNames, suggestDeviceName, validDeviceName } from './device-names';
import { createVariableIfAbsent, listSecrets, readVariable, saveVariable } from './github';

/** Only the device whose current subscription is verified may suggest a shared name. */
export async function syncCurrentDeviceName(repo: string, token: string): Promise<string | null> {
  if (!await browserPushEnabled()) return null;
  const slot = currentDeviceSlot();
  if (!slot) return null;
  const secrets = await listSecrets(repo, token);
  if (!matchesCurrentDevice(slot, secrets[slot])) return null;
  const variable = deviceNameVariable(slot);
  const existing = await readVariable(repo, token, variable);
  if (existing !== null && validDeviceName(existing)) return existing.trim();
  const base = (await suggestDeviceName()).trim();
  const latest = await listSecrets(repo, token);
  if (!await browserPushEnabled() || currentDeviceSlot() !== slot || !matchesCurrentDevice(slot, latest[slot])) return null;
  // 같은 이름이 이미 있으면 "이름 (2)"처럼 번호를 붙여 기기를 구분한다.
  const others = [...DEVICE_SLOTS, 'WEB_PUSH_SUBSCRIPTION'].filter((name) => name !== slot && latest[name]);
  const taken = new Set(Object.values(await loadDeviceNames(repo, token, others)));
  let suggestion = base;
  for (let n = 2; taken.has(suggestion); n += 1) suggestion = `${base} (${n})`;
  // 새 칸은 이름 변수를 빈 값으로 비워 두므로, 빈 값이면 덮어쓴다.
  if (existing === null) {
    if (await createVariableIfAbsent(repo, token, variable, suggestion)) return suggestion;
    const winner = await readVariable(repo, token, variable);
    return winner && validDeviceName(winner) ? winner.trim() : null;
  }
  await saveVariable(repo, token, variable, suggestion);
  return suggestion;
}
