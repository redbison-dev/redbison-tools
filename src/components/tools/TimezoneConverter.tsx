import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Globe, Copy, Plus, X, Maximize, Minimize, Clock, Share2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useUrlParams } from '@/hooks/useUrlParams';
import { useLocation, useNavigate } from 'react-router-dom';
import { withMarketDefaults } from '@/hooks/useCalculatorParams';
import {
  formatInTimeZone,
  fromDateTimeLocalValue,
  isValidTimeZone,
  parseDateOrder,
  parseTimeParam,
  parseZoneList,
  parseZonesParam,
  toDateTimeLocalValue,
  type DateOrder,
} from '@/lib/tools/timezone-converter';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

/**
 * Starting setup. A market version (/en-in/timezone-converter) overrides these
 * through its `defaults`: date order, the cards shown first and the quick-add row.
 */
const TZ_DEFAULTS = {
  dateFormat: 'mdy',
  zones: 'UTC,America/New_York,Europe/London,Asia/Tokyo',
  quickZones: 'America/Los_Angeles,America/Chicago,Europe/Paris,Asia/Shanghai,Australia/Sydney',
};
const DATE_FORMAT_OPTIONS: { value: DateOrder; label: string }[] = [
  { value: 'mdy', label: 'MM/DD/YYYY' },
  { value: 'dmy', label: 'DD/MM/YYYY' },
  { value: 'ymd', label: 'YYYY-MM-DD' },
];

const TimezoneConverter = () => {
  const { t: tx } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [setup] = useState(() => withMarketDefaults(TZ_DEFAULTS, pathname));
  const defaultZones = parseZoneList(setup.zones, ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']);
  const quickZones = parseZoneList(setup.quickZones, []);
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [sourceTimezone, setSourceTimezone] = useState('');
  const [selectedTimezones, setSelectedTimezones] = useState(defaultZones);
  const [dateFormat, setDateFormat] = useState<DateOrder>(parseDateOrder(setup.dateFormat));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sourceTimezoneOpen, setSourceTimezoneOpen] = useState(false);
  const [addTimezoneOpen, setAddTimezoneOpen] = useState(false);
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();
  const { getUrlParams, updateUrlParams } = useUrlParams();

  // Comprehensive timezone list with country, city, and ISO info for better search
  const timezones: { value: string; label: string; offset: string; country: string; iso: string; aliases?: string }[] = [
    // Americas
    { value: 'America/New_York', label: tx('New York (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: tx('United States'), iso: 'EST' },
    { value: 'America/Chicago', label: tx('Chicago (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: tx('United States'), iso: 'CST' },
    { value: 'America/Denver', label: tx('Denver (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: tx('United States'), iso: 'MST' },
    { value: 'America/Los_Angeles', label: tx('Los Angeles (GMT-8:00/-7:00)'), offset: '-8:00/-7:00', country: tx('United States'), iso: 'PST' },
    { value: 'America/Anchorage', label: tx('Anchorage (GMT-9:00/-8:00)'), offset: '-9:00/-8:00', country: tx('United States'), iso: 'AKST' },
    { value: 'Pacific/Honolulu', label: tx('Honolulu (GMT-10:00)'), offset: '-10:00', country: tx('United States'), iso: 'HST' },
    
    { value: 'America/Toronto', label: tx('Toronto (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: tx('Canada'), iso: 'EST', aliases: 'Ottawa Montreal Ontario Quebec' },
    { value: 'America/Vancouver', label: tx('Vancouver (GMT-7:00 all year from 2026)'), offset: '-7:00', country: tx('Canada'), iso: 'PST', aliases: 'Victoria British Columbia' },
    { value: 'America/Edmonton', label: tx('Edmonton (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: tx('Canada'), iso: 'MST', aliases: 'Calgary Alberta' },
    { value: 'America/Winnipeg', label: tx('Winnipeg (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: tx('Canada'), iso: 'CST', aliases: 'Manitoba' },
    { value: 'America/Regina', label: tx('Regina (GMT-6:00)'), offset: '-6:00', country: tx('Canada'), iso: 'CST', aliases: 'Saskatoon Saskatchewan' },
    { value: 'America/Whitehorse', label: tx('Whitehorse (GMT-7:00)'), offset: '-7:00', country: tx('Canada'), iso: 'MST', aliases: 'Yukon' },
    { value: 'America/Halifax', label: tx('Halifax (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: tx('Canada'), iso: 'AST', aliases: 'Nova Scotia New Brunswick Moncton Charlottetown' },
    { value: 'America/St_Johns', label: tx('St. John\'s (GMT-3:30/-2:30)'), offset: '-3:30/-2:30', country: tx('Canada'), iso: 'NST', aliases: 'Newfoundland' },
    
    { value: 'America/Mexico_City', label: tx('Mexico City (GMT-6:00)'), offset: '-6:00', country: tx('Mexico'), iso: 'CST' },
    { value: 'America/Cancun', label: tx('Cancun (GMT-5:00)'), offset: '-5:00', country: tx('Mexico'), iso: 'EST' },
    
    { value: 'America/Sao_Paulo', label: tx('São Paulo (GMT-3:00)'), offset: '-3:00', country: tx('Brazil'), iso: 'BRT' },
    { value: 'America/Rio_Branco', label: tx('Rio Branco (GMT-5:00)'), offset: '-5:00', country: tx('Brazil'), iso: 'ACT' },
    { value: 'America/Manaus', label: tx('Manaus (GMT-4:00)'), offset: '-4:00', country: tx('Brazil'), iso: 'AMT' },
    
    { value: 'America/Argentina/Buenos_Aires', label: tx('Buenos Aires (GMT-3:00)'), offset: '-3:00', country: tx('Argentina'), iso: 'ART' },
    { value: 'America/Lima', label: tx('Lima (GMT-5:00)'), offset: '-5:00', country: tx('Peru'), iso: 'PET' },
    { value: 'America/Santiago', label: tx('Santiago (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: tx('Chile'), iso: 'CLT' },
    { value: 'America/Caracas', label: tx('Caracas (GMT-4:00)'), offset: '-4:00', country: tx('Venezuela'), iso: 'VET' },
    { value: 'America/Bogota', label: tx('Bogotá (GMT-5:00)'), offset: '-5:00', country: tx('Colombia'), iso: 'COT' },
    
    // Europe
    { value: 'UTC', label: 'UTC (GMT+0:00)', offset: '+0:00', country: tx('Coordinated Universal Time'), iso: 'UTC' },
    { value: 'Europe/London', label: tx('London (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: tx('United Kingdom'), iso: 'GMT', aliases: 'BST Manchester Birmingham Edinburgh Glasgow Cardiff Belfast' },
    { value: 'Europe/Dublin', label: tx('Dublin (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: tx('Ireland'), iso: 'GMT' },
    
    { value: 'Europe/Paris', label: tx('Paris (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('France'), iso: 'CET' },
    { value: 'Europe/Berlin', label: tx('Berlin (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Germany'), iso: 'CET' },
    { value: 'Europe/Rome', label: tx('Rome (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Italy'), iso: 'CET' },
    { value: 'Europe/Madrid', label: tx('Madrid (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Spain'), iso: 'CET' },
    { value: 'Europe/Amsterdam', label: tx('Amsterdam (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Netherlands'), iso: 'CET' },
    { value: 'Europe/Brussels', label: tx('Brussels (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Belgium'), iso: 'CET' },
    { value: 'Europe/Zurich', label: tx('Zurich (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Switzerland'), iso: 'CET' },
    { value: 'Europe/Vienna', label: tx('Vienna (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Austria'), iso: 'CET' },
    { value: 'Europe/Prague', label: tx('Prague (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Czech Republic'), iso: 'CET' },
    { value: 'Europe/Warsaw', label: tx('Warsaw (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Poland'), iso: 'CET' },
    { value: 'Europe/Stockholm', label: tx('Stockholm (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Sweden'), iso: 'CET' },
    { value: 'Europe/Oslo', label: tx('Oslo (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Norway'), iso: 'CET' },
    { value: 'Europe/Copenhagen', label: tx('Copenhagen (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: tx('Denmark'), iso: 'CET' },
    { value: 'Europe/Helsinki', label: tx('Helsinki (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: tx('Finland'), iso: 'EET' },
    
    { value: 'Europe/Athens', label: tx('Athens (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: tx('Greece'), iso: 'EET' },
    { value: 'Europe/Bucharest', label: tx('Bucharest (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: tx('Romania'), iso: 'EET' },
    { value: 'Europe/Sofia', label: tx('Sofia (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: tx('Bulgaria'), iso: 'EET' },
    { value: 'Europe/Kiev', label: tx('Kiev (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: tx('Ukraine'), iso: 'EET' },
    
    { value: 'Europe/Moscow', label: tx('Moscow (GMT+3:00)'), offset: '+3:00', country: tx('Russia'), iso: 'MSK' },
    { value: 'Europe/Istanbul', label: tx('Istanbul (GMT+3:00)'), offset: '+3:00', country: tx('Turkey'), iso: 'TRT' },
    
    // Asia
    { value: 'Asia/Dubai', label: tx('Dubai (GMT+4:00)'), offset: '+4:00', country: tx('United Arab Emirates'), iso: 'GST' },
    { value: 'Asia/Qatar', label: tx('Doha (GMT+3:00)'), offset: '+3:00', country: tx('Qatar'), iso: 'AST' },
    { value: 'Asia/Kuwait', label: tx('Kuwait City (GMT+3:00)'), offset: '+3:00', country: tx('Kuwait'), iso: 'AST' },
    { value: 'Asia/Riyadh', label: tx('Riyadh (GMT+3:00)'), offset: '+3:00', country: tx('Saudi Arabia'), iso: 'AST' },
    
    { value: 'Asia/Tehran', label: tx('Tehran (GMT+3:30)'), offset: '+3:30', country: tx('Iran'), iso: 'IRST' },
    { value: 'Asia/Kabul', label: tx('Kabul (GMT+4:30)'), offset: '+4:30', country: tx('Afghanistan'), iso: 'AFT' },
    
    { value: 'Asia/Karachi', label: tx('Karachi (GMT+5:00)'), offset: '+5:00', country: tx('Pakistan'), iso: 'PKT' },
    { value: 'Asia/Kolkata', label: tx('Kolkata (GMT+5:30)'), offset: '+5:30', country: tx('India'), iso: 'IST', aliases: 'Mumbai Delhi Bengaluru Bangalore Chennai Hyderabad Pune' },
    
    { value: 'Asia/Kathmandu', label: tx('Kathmandu (GMT+5:45)'), offset: '+5:45', country: tx('Nepal'), iso: 'NPT' },
    { value: 'Asia/Dhaka', label: tx('Dhaka (GMT+6:00)'), offset: '+6:00', country: tx('Bangladesh'), iso: 'BST' },
    { value: 'Asia/Colombo', label: tx('Colombo (GMT+5:30)'), offset: '+5:30', country: tx('Sri Lanka'), iso: 'SLST' },
    
    { value: 'Asia/Yangon', label: tx('Yangon (GMT+6:30)'), offset: '+6:30', country: tx('Myanmar'), iso: 'MMT' },
    { value: 'Asia/Bangkok', label: tx('Bangkok (GMT+7:00)'), offset: '+7:00', country: tx('Thailand'), iso: 'ICT' },
    { value: 'Asia/Ho_Chi_Minh', label: tx('Ho Chi Minh City (GMT+7:00)'), offset: '+7:00', country: tx('Vietnam'), iso: 'ICT' },
    { value: 'Asia/Jakarta', label: tx('Jakarta (GMT+7:00)'), offset: '+7:00', country: tx('Indonesia'), iso: 'WIB' },
    { value: 'Asia/Manila', label: tx('Manila (GMT+8:00)'), offset: '+8:00', country: tx('Philippines'), iso: 'PHT' },
    { value: 'Asia/Kuala_Lumpur', label: tx('Kuala Lumpur (GMT+8:00)'), offset: '+8:00', country: tx('Malaysia'), iso: 'MYT' },
    { value: 'Asia/Singapore', label: tx('Singapore (GMT+8:00)'), offset: '+8:00', country: tx('Singapore'), iso: 'SGT' },
    
    { value: 'Asia/Shanghai', label: tx('Shanghai (GMT+8:00)'), offset: '+8:00', country: tx('China'), iso: 'CST' },
    { value: 'Asia/Hong_Kong', label: tx('Hong Kong (GMT+8:00)'), offset: '+8:00', country: tx('Hong Kong'), iso: 'HKT' },
    { value: 'Asia/Macau', label: tx('Macau (GMT+8:00)'), offset: '+8:00', country: tx('Macau'), iso: 'CST' },
    { value: 'Asia/Taipei', label: tx('Taipei (GMT+8:00)'), offset: '+8:00', country: tx('Taiwan'), iso: 'CST' },
    
    { value: 'Asia/Seoul', label: tx('Seoul (GMT+9:00)'), offset: '+9:00', country: tx('South Korea'), iso: 'KST' },
    { value: 'Asia/Tokyo', label: tx('Tokyo (GMT+9:00)'), offset: '+9:00', country: tx('Japan'), iso: 'JST' },
    
    // Australia & Oceania
    { value: 'Australia/Sydney', label: tx('Sydney (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: tx('Australia'), iso: 'AEST', aliases: 'Canberra New South Wales ACT' },
    { value: 'Australia/Melbourne', label: tx('Melbourne (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: tx('Australia'), iso: 'AEST' },
    { value: 'Australia/Brisbane', label: tx('Brisbane (GMT+10:00)'), offset: '+10:00', country: tx('Australia'), iso: 'AEST', aliases: 'Queensland Gold Coast' },
    { value: 'Australia/Adelaide', label: tx('Adelaide (GMT+9:30/+10:30)'), offset: '+9:30/+10:30', country: tx('Australia'), iso: 'ACST' },
    { value: 'Australia/Perth', label: tx('Perth (GMT+8:00)'), offset: '+8:00', country: tx('Australia'), iso: 'AWST' },
    { value: 'Australia/Darwin', label: tx('Darwin (GMT+9:30)'), offset: '+9:30', country: tx('Australia'), iso: 'ACST' },
    { value: 'Australia/Hobart', label: tx('Hobart (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: tx('Australia'), iso: 'AEST', aliases: 'Tasmania' },
    { value: 'Australia/Lord_Howe', label: tx('Lord Howe Island (GMT+10:30/+11:00)'), offset: '+10:30/+11:00', country: tx('Australia'), iso: 'LHST' },
    
    { value: 'Pacific/Auckland', label: tx('Auckland (GMT+12:00/+13:00)'), offset: '+12:00/+13:00', country: tx('New Zealand'), iso: 'NZST' },
    { value: 'Pacific/Fiji', label: tx('Suva (GMT+12:00)'), offset: '+12:00', country: tx('Fiji'), iso: 'FJT' },
    
    // Africa
    { value: 'Africa/Cairo', label: tx('Cairo (GMT+2:00)'), offset: '+2:00', country: tx('Egypt'), iso: 'EET' },
    { value: 'Africa/Lagos', label: tx('Lagos (GMT+1:00)'), offset: '+1:00', country: tx('Nigeria'), iso: 'WAT' },
    { value: 'Africa/Nairobi', label: tx('Nairobi (GMT+3:00)'), offset: '+3:00', country: tx('Kenya'), iso: 'EAT' },
    { value: 'Africa/Johannesburg', label: tx('Johannesburg (GMT+2:00)'), offset: '+2:00', country: tx('South Africa'), iso: 'SAST' },
    { value: 'Africa/Casablanca', label: tx('Casablanca (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: tx('Morocco'), iso: 'WET' }
  ];

  const allTimezones = timezones.map(tz => tz.value);

  useEffect(() => {
    // Detect user's timezone and set as default
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setSourceTimezone(isValidTimeZone(userTz) ? userTz : 'UTC');
    
    // Load from URL parameters
    const urlParams = getUrlParams();
    const timeParam = urlParams.get('time');
    const timezoneParam = urlParams.get('timezone');
    const timezonesParam = urlParams.get('timezones');
    
    const sharedTime = parseTimeParam(timeParam);
    if (sharedTime) {
      setSelectedTime(sharedTime);
    }
    if (timezoneParam && isValidTimeZone(timezoneParam)) {
      setSourceTimezone(timezoneParam);
    }
    const datesParam = urlParams.get('dates');
    if (datesParam) setDateFormat(parseDateOrder(datesParam));
    const sharedZones = parseZonesParam(timezonesParam);
    if (sharedZones) {
      setSelectedTimezones(sharedZones);
    }
    // Read the URL once on mount. getUrlParams is a new function on every render, so depending on it
    // re-ran this effect after every update and reset the source zone (and looped when ?time= was set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The datetime-local field shows and accepts wall-clock time in the source timezone.
  const effectiveSource = sourceTimezone || 'UTC';

  const formatTimeInTimezone = (timezone: string, date: Date = selectedTime) => {
    const out = formatInTimeZone(date, timezone, dateFormat);
    return out === 'Invalid date' ? tx('Invalid date') : out === 'Invalid timezone' ? tx('Invalid timezone') : out;
  };

  const getTimezoneOffset = (timezone: string, date: Date = selectedTime) => {
    try {
      const offset = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
      return offset || '';
    } catch (error) {
      return '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    trackAction('timezone_copy', { timezone: label });
    toast({
      title: tx('Copied!'),
      description: tx('{label} time copied to clipboard', { label }),
    });
  };

  const addTimezone = (timezone: string) => {
    if (!selectedTimezones.includes(timezone)) {
      setSelectedTimezones([...selectedTimezones, timezone]);
      trackAction('timezone_add', { timezone });
    }
  };

  const removeTimezone = (timezone: string) => {
    if (selectedTimezones.length > 1) {
      setSelectedTimezones(selectedTimezones.filter(tz => tz !== timezone));
      trackAction('timezone_remove', { timezone });
    }
  };

  const getTimezoneName = (timezone: string) => {
    const tz = timezones.find(t => t.value === timezone);
    return tz ? tz.label : timezone;
  };

  const updateTime = (newTime: string) => {
    const date = fromDateTimeLocalValue(newTime, effectiveSource);
    if (!date) return;
    setSelectedTime(date);
    updateUrlParams({ time: date.toISOString(), timezone: effectiveSource });
    trackAction('timezone_time_change', { time: newTime });
  };

  const updateSourceTimezone = (timezone: string) => {
    // Keep the clock time the user typed and reinterpret it in the new source zone.
    const date = fromDateTimeLocalValue(toDateTimeLocalValue(selectedTime, effectiveSource), timezone) ?? selectedTime;
    setSelectedTime(date);
    setSourceTimezone(timezone);
    updateUrlParams({ timezone, time: date.toISOString() });
    trackAction('timezone_source_change', { timezone });
  };

  const shareConfiguration = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('time', selectedTime.toISOString());
    url.searchParams.set('timezone', sourceTimezone);
    url.searchParams.set('timezones', encodeURIComponent(JSON.stringify(selectedTimezones)));
    url.searchParams.set('dates', dateFormat);
    
    navigator.clipboard.writeText(url.toString());
    trackAction('timezone_share');
    toast({
      title: tx('Configuration Shared!'),
      description: tx('URL with current settings copied to clipboard'),
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', `${selectedTime.getTime()}|${sourceTimezone}|${selectedTimezones.join(',')}`);

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : 'tool-page bg-white min-h-screen'}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'max-w-7xl mx-auto px-4 sm:px-8 -mt-6 pb-1 sm:pb-2'}`}>
          {!isFullscreen && (
            <ToolBreadcrumb 
              category={{ label: tx('Development & Tech'), href: "/category/development-tech" }}
              subcategory={{ label: tx('Time Tools'), href: "/category/development-tech/time-tools" }}
              toolName={tx('Timezone Converter')}
            />
          )}
          
          <div className={`${!isFullscreen ? 'tool-header mt-1' : ''} space-y-4`}>
            {isMobile ? (
              <div className="space-y-3">
                <div>
                  <h1 className={`${!isFullscreen ? 'tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold' : 'text-3xl font-bold text-black'} flex items-center`}>
                    <Clock className={`${!isFullscreen ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-8 w-8'} mr-3 text-purple-600`} />
                    {tx('Time Zone Converter')}
                  </h1>
                  <p className={`${!isFullscreen ? 'tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13' : 'text-gray-600 text-base'} mt-1`}>{tx('Convert specific times across different timezones')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{tx('Converter')}</Badge>
                  <Badge variant="outline" className="border-orange-500 text-orange-600 px-3 py-1 bg-orange-50 text-xs sm:text-sm">{tx('Static Time')}</Badge>
                  <Button size="sm" variant="outline" onClick={shareConfiguration} className="border-gray-300 text-gray-600 hover:bg-gray-100">
                    <Share2 className="h-3 w-3 mr-1" />
                    {tx('Share')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className={`${!isFullscreen ? 'tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold' : 'text-4xl font-bold text-black'} flex items-center`}>
                    <Clock className={`${!isFullscreen ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-10 w-10'} mr-3 text-purple-600`} />
                    {tx('Time Zone Converter')}
                  </h1>
                  <p className={`${!isFullscreen ? 'tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13' : 'text-gray-600 text-lg'}`}>{tx('Convert specific times across different timezones')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{tx('Converter')}</Badge>
                  <Badge variant="outline" className="border-orange-500 text-orange-600 px-3 py-1 bg-orange-50 text-xs sm:text-sm">{tx('Static Time')}</Badge>
                  <Button size="sm" variant="outline" onClick={shareConfiguration} className="border-gray-300 text-gray-600 hover:bg-gray-100">
                    <Share2 className="h-4 w-4 mr-2" />
                    {tx('Share')}
                  </Button>
                  {!isMobile && (
                    <Button size="sm" variant="outline" onClick={toggleFullscreen} className="border-gray-300 text-gray-600 hover:bg-gray-100">
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

        <div className={`${!isFullscreen ? 'mt-6 sm:mt-8' : ''} space-y-8`}>

        {/* Time and Source Timezone Input */}
        <Card className="bg-white border-2 border-gray-200 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-black flex items-center text-lg">
              <Clock className="h-5 w-5 mr-2" />
              {tx('Set Time and Source Timezone')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">{tx('Time (in source timezone)')}</label>
                <Input
                  type="datetime-local"
                  value={toDateTimeLocalValue(selectedTime, effectiveSource)}
                  onChange={(e) => updateTime(e.target.value)}
                  className="bg-white border-2 border-gray-300 text-black"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">{tx('Source Timezone')}</label>
                <Popover open={sourceTimezoneOpen} onOpenChange={setSourceTimezoneOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={sourceTimezoneOpen}
                      className="w-full justify-between bg-white border-2 border-gray-300 text-black"
                    >
                      {sourceTimezone ? `${sourceTimezone} - ${getTimezoneName(sourceTimezone)}` : tx('Select source timezone...')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-white border-2 border-gray-200" style={{ zIndex: 9999 }}>
                    <Command
                      filter={(value, search) => {
                        if (!search) return 1;
                        
                        // Find the timezone object from the value
                        const timezone = timezones.find(tz => {
                          const searchData = `${tz.country} ${tz.iso} ${tz.label} ${tz.value}`;
                          return searchData === value;
                        });
                        
                        if (!timezone) return 0;
                        
                        const searchLower = search.toLowerCase();
                        const countryLower = timezone.country.toLowerCase();
                        const cityName = timezone.label.split(' ')[0].toLowerCase();
                        const isoLower = timezone.iso.toLowerCase();
                        
                        // Check for exact matches in country or city name
                        const hasExactMatch = timezones.some(tz => {
                          const tzCountryLower = tz.country.toLowerCase();
                          const tzCityName = tz.label.split(' ')[0].toLowerCase();
                          return tzCountryLower.includes(searchLower) || tzCityName.includes(searchLower);
                        });
                        
                        if (hasExactMatch) {
                          // Only show items that have exact matches in country or city
                          if (countryLower.includes(searchLower) || cityName.includes(searchLower)) {
                            return 1;
                          }
                          return 0;
                        }
                        
                        // Fall back to fuzzy matching if no exact matches
                        if (countryLower.includes(searchLower) || 
                            cityName.includes(searchLower) || 
                            isoLower.includes(searchLower) ||
                            timezone.value.toLowerCase().includes(searchLower) ||
                            (timezone.aliases ?? '').toLowerCase().includes(searchLower)) {
                          return 1;
                        }
                        
                        return 0;
                      }}
                    >
                      <CommandInput placeholder={tx('Search timezone, country, or ISO code...')} className="h-9" />
                      <CommandList>
                        <CommandEmpty>{tx('No timezone found.')}</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {timezones.map((timezone) => {
                            const searchData = `${timezone.country} ${timezone.iso} ${timezone.label} ${timezone.value}`;
                            return (
                              <CommandItem
                                key={timezone.value}
                                value={searchData}
                                onSelect={() => {
                                  updateSourceTimezone(timezone.value);
                                  setSourceTimezoneOpen(false);
                                }}
                                className="text-black hover:bg-gray-100"
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${sourceTimezone === timezone.value ? "opacity-100" : "opacity-0"}`}
                                />
                                {timezone.country}, {timezone.label}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium text-black" id="tz-date-format">{tx('Date format')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="tz-date-format">
                {DATE_FORMAT_OPTIONS.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={dateFormat === o.value ? 'default' : 'outline'}
                    aria-pressed={dateFormat === o.value}
                    onClick={() => {
                      setDateFormat(o.value);
                      trackAction('timezone_date_format', { format: o.value });
                    }}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Timezone */}
        <Card className="bg-white border-2 border-gray-200 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-black flex items-center text-lg">
              <Plus className="h-5 w-5 mr-2" />
              {tx('Add Timezone')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Popover open={addTimezoneOpen} onOpenChange={setAddTimezoneOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={addTimezoneOpen}
                  className="w-full justify-between bg-white border-2 border-gray-300 text-black"
                >
                  {tx('Select timezone to add...')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-white border-2 border-gray-200" style={{ zIndex: 9999 }}>
                <Command
                  filter={(value, search) => {
                    if (!search) return 1;
                    
                    // Find the timezone object from the value
                    const timezone = timezones.find(tz => {
                      const searchData = `${tz.country} ${tz.iso} ${tz.label} ${tz.value}`;
                      return searchData === value;
                    });
                    
                    if (!timezone) return 0;
                    
                    const searchLower = search.toLowerCase();
                    const countryLower = timezone.country.toLowerCase();
                    const cityName = timezone.label.split(' ')[0].toLowerCase();
                    const isoLower = timezone.iso.toLowerCase();
                    
                    // Check for exact matches in country or city name
                    const hasExactMatch = timezones.some(tz => {
                      const tzCountryLower = tz.country.toLowerCase();
                      const tzCityName = tz.label.split(' ')[0].toLowerCase();
                      return tzCountryLower.includes(searchLower) || tzCityName.includes(searchLower);
                    });
                    
                    if (hasExactMatch) {
                      // Only show items that have exact matches in country or city
                      if (countryLower.includes(searchLower) || cityName.includes(searchLower)) {
                        return 1;
                      }
                      return 0;
                    }
                    
                    // Fall back to fuzzy matching if no exact matches
                    if (countryLower.includes(searchLower) || 
                        cityName.includes(searchLower) || 
                        isoLower.includes(searchLower) ||
                        timezone.value.toLowerCase().includes(searchLower) ||
                        (timezone.aliases ?? '').toLowerCase().includes(searchLower)) {
                      return 1;
                    }
                    
                    return 0;
                  }}
                >
                  <CommandInput placeholder={tx('Search timezone, country, or ISO code...')} className="h-9" />
                  <CommandList>
                    <CommandEmpty>{tx('No timezone found.')}</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {timezones
                        .filter(tz => !selectedTimezones.includes(tz.value))
                        .map((timezone) => {
                          const searchData = `${timezone.country} ${timezone.iso} ${timezone.label} ${timezone.value}`;
                          return (
                            <CommandItem
                              key={timezone.value}
                              value={searchData}
                              onSelect={() => {
                                addTimezone(timezone.value);
                                setAddTimezoneOpen(false);
                              }}
                              className="text-black hover:bg-gray-100"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              {timezone.country}, {timezone.label}
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* Current Time Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {selectedTimezones.map((timezone) => (
            <Card key={timezone} className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-black flex items-center text-lg">
                    <Globe className="h-5 w-5 mr-2" />
                    {timezone}
                  </CardTitle>
                  {selectedTimezones.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeTimezone(timezone)}
                      className="text-red-500 hover:bg-red-50 h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <CardDescription className="text-gray-600 text-sm">
                  {getTimezoneName(timezone)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Current Time */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div className={`text-black font-mono ${isMobile ? 'text-lg' : 'text-xl'} flex ${isMobile ? 'flex-col space-y-2' : 'items-center justify-between'}`}>
                      <span className={isMobile ? 'break-all' : ''}>{formatTimeInTimezone(timezone)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(formatTimeInTimezone(timezone), timezone)}
                        className="text-black hover:bg-gray-200 opacity-50 hover:opacity-100"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Timezone Offset */}
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600 mb-1">{tx('UTC Offset:')}</div>
                    <div className="text-black font-mono text-sm">
                      {getTimezoneOffset(timezone)}
                    </div>
                  </div>

                  {/* User's timezone comparison */}
                  {sourceTimezone && sourceTimezone !== timezone && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-sm text-blue-600 mb-1">{tx('Source Time ({sourceTimezone}):', { sourceTimezone })}</div>
                      <div className="text-black font-mono text-sm">
                        {formatTimeInTimezone(sourceTimezone)}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Add Popular Timezones */}
        <Card className="bg-gray-50 border-2 border-gray-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-black text-lg">{tx('Quick Add Popular Timezones')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {quickZones
                .filter(tz => !selectedTimezones.includes(tz))
                .map((timezone) => (
                  <Button
                    key={timezone}
                    onClick={() => addTimezone(timezone)}
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {(timezone.split('/').pop() ?? timezone).replace(/_/g, ' ')}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
        </div>
        </div>
      </div>
    </>
  );
};

export default TimezoneConverter;