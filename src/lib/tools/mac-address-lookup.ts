/**
 * MAC address parsing and a small built-in OUI table. Entries were checked
 * against the IEEE MA-L registry (standards-oui.ieee.org/oui/oui.csv).
 */

import { msg } from '../msg';

export interface OuiEntry {
  vendor: string;
  type: string;
  country: string;
}

export const OUI_TABLE: Record<string, OuiEntry> = {
  '00:50:56': { vendor: 'VMware, Inc.', type: msg('Virtual Machine'), country: msg('United States') },
  '08:00:27': { vendor: 'PCS Systemtechnik GmbH (used by Oracle VirtualBox)', type: msg('Virtual Machine'), country: msg('United States') },
  '00:1B:21': { vendor: 'Intel Corporate', type: msg('Network Interface'), country: msg('United States') },
  '00:E0:4C': { vendor: 'Realtek Semiconductor Corp.', type: msg('Network Interface'), country: msg('Taiwan') },
  '00:1A:92': { vendor: 'ASUSTek Computer Inc.', type: msg('Network Interface'), country: msg('Taiwan') },
  '00:23:DF': { vendor: 'Apple, Inc.', type: msg('Apple Device'), country: msg('United States') },
  '00:26:BB': { vendor: 'Apple, Inc.', type: msg('Apple Device'), country: msg('United States') },
  '00:26:08': { vendor: 'Apple, Inc.', type: msg('Apple Device'), country: msg('United States') },
  '84:38:35': { vendor: 'Apple, Inc.', type: msg('Apple Device'), country: msg('United States') },
  '3C:15:C2': { vendor: 'Apple, Inc.', type: msg('Apple Device'), country: msg('United States') },
  '00:50:C2': { vendor: 'IEEE Registration Authority', type: msg('Special Purpose'), country: msg('Global') },
  '00:1D:60': { vendor: 'ASUSTek Computer Inc.', type: msg('Network Interface'), country: msg('Taiwan') },
  '00:24:E8': { vendor: 'Dell Inc.', type: msg('Network Interface'), country: msg('United States') },
  '90:B1:1C': { vendor: 'Dell Inc.', type: msg('Network Interface'), country: msg('United States') },
  '84:2B:2B': { vendor: 'Dell Inc.', type: msg('Network Interface'), country: msg('United States') },
  '00:15:5D': { vendor: 'Microsoft Corporation', type: msg('Hyper-V'), country: msg('United States') },
  '00:03:FF': { vendor: 'Microsoft Corporation', type: msg('Network Interface'), country: msg('United States') },
  '00:12:CF': { vendor: 'Accton Technology Corp', type: msg('Network Equipment'), country: msg('Taiwan') },
  '00:1F:CA': { vendor: 'Cisco Systems, Inc', type: msg('Network Equipment'), country: msg('United States') },
  '00:40:96': { vendor: 'Cisco Systems, Inc', type: msg('Network Equipment'), country: msg('United States') },
};

/**
 * Normalise a MAC address written with colons, dashes, Cisco-style dots,
 * spaces or no separators, in any case, to AA:BB:CC:DD:EE:FF.
 * Returns null unless there are exactly 12 hex digits.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[\s:.\-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g)!.join(':');
}

/** Exact OUI match only. A partial match would name the wrong manufacturer. */
export function lookupOui(oui: string): OuiEntry | null {
  return OUI_TABLE[oui.toUpperCase()] ?? null;
}

export type MacAddressType = 'Multicast' | 'Locally Administered' | 'Universally Administered';

export interface MacAnalysis {
  fullMac: string;
  oui: string;
  /** I/G bit: least significant bit of the first octet. */
  isMulticast: boolean;
  /** U/L bit: second least significant bit of the first octet. */
  isLocal: boolean;
  addressType: MacAddressType;
  vendor: OuiEntry | null;
}

/** Expects a normalised address (see normalizeMac). */
export function analyzeMac(mac: string): MacAnalysis {
  const firstOctet = parseInt(mac.slice(0, 2), 16);
  const isMulticast = (firstOctet & 0x01) !== 0;
  const isLocal = (firstOctet & 0x02) !== 0;
  const oui = mac.slice(0, 8);
  return {
    fullMac: mac,
    oui,
    isMulticast,
    isLocal,
    addressType: isMulticast ? msg('Multicast') : isLocal ? msg('Locally Administered') : msg('Universally Administered'),
    vendor: lookupOui(oui),
  };
}
