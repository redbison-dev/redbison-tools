import { msg } from '@/lib/msg';

interface TimezoneData {
  value: string;
  label: string;
  offset: string;
  country: string;
  iso: string;
  region: string;
}

interface TimezonePreferences {
  selectedTimezones: string[];
  primaryTimezone: string;
  colorAssignments: { [timezone: string]: string };
}

// Color palette for timezone coding
const TIMEZONE_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-200 dark:border-blue-700', accent: 'blue' },
  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200', border: 'border-green-200 dark:border-green-700', accent: 'green' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-200', border: 'border-purple-200 dark:border-purple-700', accent: 'purple' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-200', border: 'border-orange-200 dark:border-orange-700', accent: 'orange' },
  { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-200', border: 'border-red-200 dark:border-red-700', accent: 'red' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-800 dark:text-indigo-200', border: 'border-indigo-200 dark:border-indigo-700', accent: 'indigo' },
  { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-800 dark:text-pink-200', border: 'border-pink-200 dark:border-pink-700', accent: 'pink' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-800 dark:text-teal-200', border: 'border-teal-200 dark:border-teal-700', accent: 'teal' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-700', accent: 'amber' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-800 dark:text-cyan-200', border: 'border-cyan-200 dark:border-cyan-700', accent: 'cyan' },
];

// Comprehensive timezone data
export const TIMEZONES: TimezoneData[] = [
  // Americas
  { value: 'America/New_York', label: msg('New York (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: msg('United States'), iso: 'EST', region: msg('Americas') },
  { value: 'America/Chicago', label: msg('Chicago (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: msg('United States'), iso: 'CST', region: msg('Americas') },
  { value: 'America/Denver', label: msg('Denver (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: msg('United States'), iso: 'MST', region: msg('Americas') },
  { value: 'America/Los_Angeles', label: msg('Los Angeles (GMT-8:00/-7:00)'), offset: '-8:00/-7:00', country: msg('United States'), iso: 'PST', region: msg('Americas') },
  { value: 'America/Anchorage', label: msg('Anchorage (GMT-9:00/-8:00)'), offset: '-9:00/-8:00', country: msg('United States'), iso: 'AKST', region: msg('Americas') },
  { value: 'Pacific/Honolulu', label: msg('Honolulu (GMT-10:00)'), offset: '-10:00', country: msg('United States'), iso: 'HST', region: msg('Americas') },

  { value: 'America/Toronto', label: msg('Toronto (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: msg('Canada'), iso: 'EST', region: msg('Americas') },
  { value: 'America/Vancouver', label: msg('Vancouver (GMT-8:00/-7:00)'), offset: '-8:00/-7:00', country: msg('Canada'), iso: 'PST', region: msg('Americas') },
  { value: 'America/Calgary', label: msg('Calgary (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: msg('Canada'), iso: 'MST', region: msg('Americas') },
  { value: 'America/Winnipeg', label: msg('Winnipeg (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: msg('Canada'), iso: 'CST', region: msg('Americas') },
  { value: 'America/Halifax', label: msg('Halifax (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: msg('Canada'), iso: 'AST', region: msg('Americas') },

  { value: 'America/Mexico_City', label: msg('Mexico City (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: msg('Mexico'), iso: 'CST', region: msg('Americas') },
  { value: 'America/Cancun', label: msg('Cancun (GMT-5:00)'), offset: '-5:00', country: msg('Mexico'), iso: 'EST', region: msg('Americas') },

  { value: 'America/Sao_Paulo', label: msg('São Paulo (GMT-3:00)'), offset: '-3:00', country: msg('Brazil'), iso: 'BRT', region: msg('Americas') },
  { value: 'America/Rio_Branco', label: msg('Rio Branco (GMT-5:00)'), offset: '-5:00', country: msg('Brazil'), iso: 'ACT', region: msg('Americas') },
  { value: 'America/Manaus', label: msg('Manaus (GMT-4:00)'), offset: '-4:00', country: msg('Brazil'), iso: 'AMT', region: msg('Americas') },

  { value: 'America/Argentina/Buenos_Aires', label: msg('Buenos Aires (GMT-3:00)'), offset: '-3:00', country: msg('Argentina'), iso: 'ART', region: msg('Americas') },
  { value: 'America/Lima', label: msg('Lima (GMT-5:00)'), offset: '-5:00', country: msg('Peru'), iso: 'PET', region: msg('Americas') },
  { value: 'America/Santiago', label: msg('Santiago (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: msg('Chile'), iso: 'CLT', region: msg('Americas') },

  // Europe
  { value: 'UTC', label: 'UTC (GMT+0:00)', offset: '+0:00', country: msg('Coordinated Universal Time'), iso: 'UTC', region: msg('Universal') },
  { value: 'Europe/London', label: msg('London (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: msg('United Kingdom'), iso: 'GMT', region: msg('Europe') },
  { value: 'Europe/Dublin', label: msg('Dublin (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: msg('Ireland'), iso: 'GMT', region: msg('Europe') },

  { value: 'Europe/Paris', label: msg('Paris (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('France'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Berlin', label: msg('Berlin (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Germany'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Rome', label: msg('Rome (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Italy'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Madrid', label: msg('Madrid (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Spain'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Amsterdam', label: msg('Amsterdam (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Netherlands'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Brussels', label: msg('Brussels (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Belgium'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Zurich', label: msg('Zurich (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Switzerland'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Vienna', label: msg('Vienna (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Austria'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Prague', label: msg('Prague (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Czech Republic'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Warsaw', label: msg('Warsaw (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Poland'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Stockholm', label: msg('Stockholm (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Sweden'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Oslo', label: msg('Oslo (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Norway'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Copenhagen', label: msg('Copenhagen (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: msg('Denmark'), iso: 'CET', region: msg('Europe') },
  { value: 'Europe/Helsinki', label: msg('Helsinki (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: msg('Finland'), iso: 'EET', region: msg('Europe') },

  { value: 'Europe/Athens', label: msg('Athens (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: msg('Greece'), iso: 'EET', region: msg('Europe') },
  { value: 'Europe/Bucharest', label: msg('Bucharest (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: msg('Romania'), iso: 'EET', region: msg('Europe') },
  { value: 'Europe/Sofia', label: msg('Sofia (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: msg('Bulgaria'), iso: 'EET', region: msg('Europe') },
  { value: 'Europe/Kiev', label: msg('Kiev (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: msg('Ukraine'), iso: 'EET', region: msg('Europe') },

  { value: 'Europe/Moscow', label: msg('Moscow (GMT+3:00)'), offset: '+3:00', country: msg('Russia'), iso: 'MSK', region: msg('Europe') },
  { value: 'Europe/Istanbul', label: msg('Istanbul (GMT+3:00)'), offset: '+3:00', country: msg('Turkey'), iso: 'TRT', region: msg('Europe') },
  
  // Asia
  { value: 'Asia/Dubai', label: msg('Dubai (GMT+4:00)'), offset: '+4:00', country: msg('United Arab Emirates'), iso: 'GST', region: msg('Asia') },
  { value: 'Asia/Qatar', label: msg('Doha (GMT+3:00)'), offset: '+3:00', country: msg('Qatar'), iso: 'AST', region: msg('Asia') },
  { value: 'Asia/Kuwait', label: msg('Kuwait City (GMT+3:00)'), offset: '+3:00', country: msg('Kuwait'), iso: 'AST', region: msg('Asia') },
  { value: 'Asia/Riyadh', label: msg('Riyadh (GMT+3:00)'), offset: '+3:00', country: msg('Saudi Arabia'), iso: 'AST', region: msg('Asia') },

  { value: 'Asia/Tehran', label: msg('Tehran (GMT+3:30/+4:30)'), offset: '+3:30/+4:30', country: msg('Iran'), iso: 'IRST', region: msg('Asia') },
  { value: 'Asia/Kabul', label: msg('Kabul (GMT+4:30)'), offset: '+4:30', country: msg('Afghanistan'), iso: 'AFT', region: msg('Asia') },

  { value: 'Asia/Karachi', label: msg('Karachi (GMT+5:00)'), offset: '+5:00', country: msg('Pakistan'), iso: 'PKT', region: msg('Asia') },
  { value: 'Asia/Kolkata', label: msg('Kolkata (GMT+5:30)'), offset: '+5:30', country: msg('India'), iso: 'IST', region: msg('Asia') },
  { value: 'Asia/Mumbai', label: msg('Mumbai (GMT+5:30)'), offset: '+5:30', country: msg('India'), iso: 'IST', region: msg('Asia') },
  { value: 'Asia/Delhi', label: msg('New Delhi (GMT+5:30)'), offset: '+5:30', country: msg('India'), iso: 'IST', region: msg('Asia') },
  { value: 'Asia/Bangalore', label: msg('Bangalore (GMT+5:30)'), offset: '+5:30', country: msg('India'), iso: 'IST', region: msg('Asia') },
  { value: 'Asia/Chennai', label: msg('Chennai (GMT+5:30)'), offset: '+5:30', country: msg('India'), iso: 'IST', region: msg('Asia') },

  { value: 'Asia/Kathmandu', label: msg('Kathmandu (GMT+5:45)'), offset: '+5:45', country: msg('Nepal'), iso: 'NPT', region: msg('Asia') },
  { value: 'Asia/Dhaka', label: msg('Dhaka (GMT+6:00)'), offset: '+6:00', country: msg('Bangladesh'), iso: 'BST', region: msg('Asia') },
  { value: 'Asia/Colombo', label: msg('Colombo (GMT+5:30)'), offset: '+5:30', country: msg('Sri Lanka'), iso: 'SLST', region: msg('Asia') },

  { value: 'Asia/Yangon', label: msg('Yangon (GMT+6:30)'), offset: '+6:30', country: msg('Myanmar'), iso: 'MMT', region: msg('Asia') },
  { value: 'Asia/Bangkok', label: msg('Bangkok (GMT+7:00)'), offset: '+7:00', country: msg('Thailand'), iso: 'ICT', region: msg('Asia') },
  { value: 'Asia/Ho_Chi_Minh', label: msg('Ho Chi Minh City (GMT+7:00)'), offset: '+7:00', country: msg('Vietnam'), iso: 'ICT', region: msg('Asia') },
  { value: 'Asia/Phnom_Penh', label: msg('Phnom Penh (GMT+7:00)'), offset: '+7:00', country: msg('Cambodia'), iso: 'ICT', region: msg('Asia') },
  { value: 'Asia/Vientiane', label: msg('Vientiane (GMT+7:00)'), offset: '+7:00', country: msg('Laos'), iso: 'ICT', region: msg('Asia') },

  { value: 'Asia/Shanghai', label: msg('Shanghai (GMT+8:00)'), offset: '+8:00', country: msg('China'), iso: 'CST', region: msg('Asia') },
  { value: 'Asia/Beijing', label: msg('Beijing (GMT+8:00)'), offset: '+8:00', country: msg('China'), iso: 'CST', region: msg('Asia') },
  { value: 'Asia/Hong_Kong', label: msg('Hong Kong (GMT+8:00)'), offset: '+8:00', country: msg('Hong Kong'), iso: 'HKT', region: msg('Asia') },
  { value: 'Asia/Macau', label: msg('Macau (GMT+8:00)'), offset: '+8:00', country: msg('Macau'), iso: 'CST', region: msg('Asia') },
  { value: 'Asia/Taipei', label: msg('Taipei (GMT+8:00)'), offset: '+8:00', country: msg('Taiwan'), iso: 'CST', region: msg('Asia') },
  { value: 'Asia/Singapore', label: msg('Singapore (GMT+8:00)'), offset: '+8:00', country: msg('Singapore'), iso: 'SGT', region: msg('Asia') },
  { value: 'Asia/Kuala_Lumpur', label: msg('Kuala Lumpur (GMT+8:00)'), offset: '+8:00', country: msg('Malaysia'), iso: 'MYT', region: msg('Asia') },
  { value: 'Asia/Manila', label: msg('Manila (GMT+8:00)'), offset: '+8:00', country: msg('Philippines'), iso: 'PHT', region: msg('Asia') },
  { value: 'Asia/Jakarta', label: msg('Jakarta (GMT+7:00)'), offset: '+7:00', country: msg('Indonesia'), iso: 'WIB', region: msg('Asia') },

  { value: 'Asia/Tokyo', label: msg('Tokyo (GMT+9:00)'), offset: '+9:00', country: msg('Japan'), iso: 'JST', region: msg('Asia') },
  { value: 'Asia/Seoul', label: msg('Seoul (GMT+9:00)'), offset: '+9:00', country: msg('South Korea'), iso: 'KST', region: msg('Asia') },
  { value: 'Asia/Pyongyang', label: msg('Pyongyang (GMT+9:00)'), offset: '+9:00', country: msg('North Korea'), iso: 'KST', region: msg('Asia') },

  // Africa
  { value: 'Africa/Cairo', label: msg('Cairo (GMT+2:00)'), offset: '+2:00', country: msg('Egypt'), iso: 'EET', region: msg('Africa') },
  { value: 'Africa/Lagos', label: msg('Lagos (GMT+1:00)'), offset: '+1:00', country: msg('Nigeria'), iso: 'WAT', region: msg('Africa') },
  { value: 'Africa/Johannesburg', label: msg('Johannesburg (GMT+2:00)'), offset: '+2:00', country: msg('South Africa'), iso: 'SAST', region: msg('Africa') },
  { value: 'Africa/Nairobi', label: msg('Nairobi (GMT+3:00)'), offset: '+3:00', country: msg('Kenya'), iso: 'EAT', region: msg('Africa') },
  { value: 'Africa/Addis_Ababa', label: msg('Addis Ababa (GMT+3:00)'), offset: '+3:00', country: msg('Ethiopia'), iso: 'EAT', region: msg('Africa') },
  { value: 'Africa/Casablanca', label: msg('Casablanca (GMT+1:00)'), offset: '+1:00', country: msg('Morocco'), iso: 'WEST', region: msg('Africa') },

  // Oceania
  { value: 'Australia/Sydney', label: msg('Sydney (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: msg('Australia'), iso: 'AEST', region: msg('Oceania') },
  { value: 'Australia/Melbourne', label: msg('Melbourne (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: msg('Australia'), iso: 'AEST', region: msg('Oceania') },
  { value: 'Australia/Brisbane', label: msg('Brisbane (GMT+10:00)'), offset: '+10:00', country: msg('Australia'), iso: 'AEST', region: msg('Oceania') },
  { value: 'Australia/Perth', label: msg('Perth (GMT+8:00)'), offset: '+8:00', country: msg('Australia'), iso: 'AWST', region: msg('Oceania') },
  { value: 'Australia/Adelaide', label: msg('Adelaide (GMT+9:30/+10:30)'), offset: '+9:30/+10:30', country: msg('Australia'), iso: 'ACST', region: msg('Oceania') },
  { value: 'Australia/Darwin', label: msg('Darwin (GMT+9:30)'), offset: '+9:30', country: msg('Australia'), iso: 'ACST', region: msg('Oceania') },

  { value: 'Pacific/Auckland', label: msg('Auckland (GMT+12:00/+13:00)'), offset: '+12:00/+13:00', country: msg('New Zealand'), iso: 'NZST', region: msg('Oceania') },
  { value: 'Pacific/Fiji', label: msg('Suva (GMT+12:00)'), offset: '+12:00', country: msg('Fiji'), iso: 'FJT', region: msg('Oceania') },
  { value: 'Pacific/Noumea', label: msg('Noumea (GMT+11:00)'), offset: '+11:00', country: msg('New Caledonia'), iso: 'NCT', region: msg('Oceania') },
  { value: 'Pacific/Port_Moresby', label: msg('Port Moresby (GMT+10:00)'), offset: '+10:00', country: msg('Papua New Guinea'), iso: 'PGT', region: msg('Oceania') },

  // Pacific Islands
  { value: 'Pacific/Samoa', label: msg('Apia (GMT+13:00)'), offset: '+13:00', country: msg('Samoa'), iso: 'WSST', region: msg('Pacific') },
  { value: 'Pacific/Tongatapu', label: msg('Nuku\'alofa (GMT+13:00)'), offset: '+13:00', country: msg('Tonga'), iso: 'TOT', region: msg('Pacific') },
  { value: 'Pacific/Kiritimati', label: msg('Kiritimati (GMT+14:00)'), offset: '+14:00', country: msg('Kiribati'), iso: 'LINT', region: msg('Pacific') }
];

class TimezoneService {
  private static readonly STORAGE_KEY = 'redbison_timezone_preferences';
  private static instance: TimezoneService;
  private preferences: TimezonePreferences;

  private constructor() {
    this.preferences = this.loadPreferences();
  }

  static getInstance(): TimezoneService {
    if (!TimezoneService.instance) {
      TimezoneService.instance = new TimezoneService();
    }
    return TimezoneService.instance;
  }

  private loadPreferences(): TimezonePreferences {
    try {
      const stored = localStorage.getItem(TimezoneService.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          selectedTimezones: parsed.selectedTimezones || ['UTC'],
          primaryTimezone: parsed.primaryTimezone || 'UTC',
          colorAssignments: parsed.colorAssignments || {}
        };
      }
    } catch (error) {
      console.error('Failed to load timezone preferences:', error);
    }

    // Default preferences
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      selectedTimezones: ['UTC', userTimezone].filter((tz, index, arr) => arr.indexOf(tz) === index),
      primaryTimezone: userTimezone,
      colorAssignments: {}
    };
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(TimezoneService.STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save timezone preferences:', error);
    }
  }

  getSelectedTimezones(): string[] {
    return [...this.preferences.selectedTimezones];
  }

  getPrimaryTimezone(): string {
    return this.preferences.primaryTimezone;
  }

  addTimezone(timezone: string): void {
    if (!this.preferences.selectedTimezones.includes(timezone)) {
      this.preferences.selectedTimezones.push(timezone);
      this.assignTimezoneColor(timezone);
      this.savePreferences();
    }
  }

  removeTimezone(timezone: string): void {
    if (timezone !== 'UTC' && this.preferences.selectedTimezones.length > 1) {
      this.preferences.selectedTimezones = this.preferences.selectedTimezones.filter(tz => tz !== timezone);
      delete this.preferences.colorAssignments[timezone];
      
      // If removing primary timezone, set new primary
      if (this.preferences.primaryTimezone === timezone) {
        this.preferences.primaryTimezone = this.preferences.selectedTimezones[0];
      }
      
      this.savePreferences();
    }
  }

  setPrimaryTimezone(timezone: string): void {
    if (this.preferences.selectedTimezones.includes(timezone)) {
      this.preferences.primaryTimezone = timezone;
      this.savePreferences();
    }
  }

  private assignTimezoneColor(timezone: string): void {
    if (!this.preferences.colorAssignments[timezone]) {
      const usedColors = Object.values(this.preferences.colorAssignments);
      const availableColor = TIMEZONE_COLORS.find(color => !usedColors.includes(color.accent));
      this.preferences.colorAssignments[timezone] = availableColor?.accent || TIMEZONE_COLORS[0].accent;
    }
  }

  getTimezoneColor(timezone: string): { bg: string; text: string; border: string; accent: string } {
    if (!this.preferences.colorAssignments[timezone]) {
      this.assignTimezoneColor(timezone);
      this.savePreferences();
    }

    const colorAccent = this.preferences.colorAssignments[timezone];
    return TIMEZONE_COLORS.find(color => color.accent === colorAccent) || TIMEZONE_COLORS[0];
  }

  getTimezoneData(timezone: string): TimezoneData | undefined {
    return TIMEZONES.find(tz => tz.value === timezone);
  }

  formatTimeInTimezone(date: Date, timezone: string): string {
    try {
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'Invalid timezone';
    }
  }

  getTimezoneInfo(date: Date, timezone: string): { abbreviation: string; offset: string } {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short'
      }).formatToParts(date);

      const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';

      const offsetParts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      }).formatToParts(date);

      const offset = offsetParts.find(part => part.type === 'timeZoneName')?.value || '';

      return { abbreviation: timeZoneName, offset };
    } catch (error) {
      return { abbreviation: '', offset: '' };
    }
  }

  searchTimezones(query: string): TimezoneData[] {
    if (!query) return TIMEZONES;

    const searchLower = query.toLowerCase();
    return TIMEZONES.filter(timezone => {
      return timezone.country.toLowerCase().includes(searchLower) ||
             timezone.label.toLowerCase().includes(searchLower) ||
             timezone.iso.toLowerCase().includes(searchLower) ||
             timezone.value.toLowerCase().includes(searchLower) ||
             timezone.region.toLowerCase().includes(searchLower);
    });
  }

  getTimezonesByRegion(): { [region: string]: TimezoneData[] } {
    return TIMEZONES.reduce((acc, timezone) => {
      if (!acc[timezone.region]) {
        acc[timezone.region] = [];
      }
      acc[timezone.region].push(timezone);
      return acc;
    }, {} as { [region: string]: TimezoneData[] });
  }
}

export const timezoneService = TimezoneService.getInstance();
export { TIMEZONE_COLORS };