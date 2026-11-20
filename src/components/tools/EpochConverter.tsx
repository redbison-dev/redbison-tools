import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { detectEpochUnit, epochToDate, toDatetimeLocal, datetimeLocalToEpoch } from '@/lib/tools/epoch-converter';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock, Copy, Share2, Calendar, Maximize2, Minimize2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useUrlParams } from '@/hooks/useUrlParams';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { timezoneService } from '@/utils/timezoneService';
import { useNavigate } from 'react-router-dom';
import { useToolResult } from '@/hooks/useToolResult';
import { msg, useFormat, useT } from '@/i18n';

const EpochConverter = () => {
  const { t } = useT();
  const fmt = useFormat();
  const [epochTime, setEpochTime] = useState('');
  const [humanTime, setHumanTime] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState('UTC');
  const [selectedTimezones, setSelectedTimezones] = useState<string[]>(['UTC']);
  const [userTimezone, setUserTimezone] = useState('');
  const [convertedDate, setConvertedDate] = useState<Date | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<'seconds' | 'milliseconds' | 'nanoseconds'>('seconds');
  const [activeTab, setActiveTab] = useState('from-epoch');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();
  const { getUrlParams, updateUrlParams } = useUrlParams();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const timezones = [
    // Americas
    { value: 'America/New_York', label: t('New York (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: 'United States', iso: 'EST' },
    { value: 'America/Chicago', label: t('Chicago (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: 'United States', iso: 'CST' },
    { value: 'America/Denver', label: t('Denver (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: 'United States', iso: 'MST' },
    { value: 'America/Los_Angeles', label: t('Los Angeles (GMT-8:00/-7:00)'), offset: '-8:00/-7:00', country: 'United States', iso: 'PST' },
    { value: 'America/Anchorage', label: t('Anchorage (GMT-9:00/-8:00)'), offset: '-9:00/-8:00', country: 'United States', iso: 'AKST' },
    { value: 'Pacific/Honolulu', label: t('Honolulu (GMT-10:00)'), offset: '-10:00', country: 'United States', iso: 'HST' },
    
    { value: 'America/Toronto', label: t('Toronto (GMT-5:00/-4:00)'), offset: '-5:00/-4:00', country: 'Canada', iso: 'EST' },
    { value: 'America/Vancouver', label: t('Vancouver (GMT-8:00/-7:00)'), offset: '-8:00/-7:00', country: 'Canada', iso: 'PST' },
    { value: 'America/Calgary', label: t('Calgary (GMT-7:00/-6:00)'), offset: '-7:00/-6:00', country: 'Canada', iso: 'MST' },
    { value: 'America/Winnipeg', label: t('Winnipeg (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: 'Canada', iso: 'CST' },
    { value: 'America/Halifax', label: t('Halifax (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: 'Canada', iso: 'AST' },
    
    { value: 'America/Mexico_City', label: t('Mexico City (GMT-6:00/-5:00)'), offset: '-6:00/-5:00', country: 'Mexico', iso: 'CST' },
    { value: 'America/Cancun', label: t('Cancun (GMT-5:00)'), offset: '-5:00', country: 'Mexico', iso: 'EST' },
    
    { value: 'America/Sao_Paulo', label: t('São Paulo (GMT-3:00)'), offset: '-3:00', country: 'Brazil', iso: 'BRT' },
    { value: 'America/Rio_Branco', label: t('Rio Branco (GMT-5:00)'), offset: '-5:00', country: 'Brazil', iso: 'ACT' },
    { value: 'America/Manaus', label: t('Manaus (GMT-4:00)'), offset: '-4:00', country: 'Brazil', iso: 'AMT' },
    
    { value: 'America/Argentina/Buenos_Aires', label: t('Buenos Aires (GMT-3:00)'), offset: '-3:00', country: 'Argentina', iso: 'ART' },
    { value: 'America/Lima', label: t('Lima (GMT-5:00)'), offset: '-5:00', country: 'Peru', iso: 'PET' },
    { value: 'America/Santiago', label: t('Santiago (GMT-4:00/-3:00)'), offset: '-4:00/-3:00', country: 'Chile', iso: 'CLT' },
    { value: 'America/Caracas', label: t('Caracas (GMT-4:00)'), offset: '-4:00', country: msg('Venezuela'), iso: 'VET' },
    { value: 'America/Bogota', label: t('Bogotá (GMT-5:00)'), offset: '-5:00', country: msg('Colombia'), iso: 'COT' },
    
    // Europe
    { value: 'UTC', label: 'UTC (GMT+0:00)', offset: '+0:00', country: 'Coordinated Universal Time', iso: 'UTC' },
    { value: 'Europe/London', label: t('London (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: 'United Kingdom', iso: 'GMT' },
    { value: 'Europe/Dublin', label: t('Dublin (GMT+0:00/+1:00)'), offset: '+0:00/+1:00', country: 'Ireland', iso: 'GMT' },
    
    { value: 'Europe/Paris', label: t('Paris (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'France', iso: 'CET' },
    { value: 'Europe/Berlin', label: t('Berlin (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Germany', iso: 'CET' },
    { value: 'Europe/Rome', label: t('Rome (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Italy', iso: 'CET' },
    { value: 'Europe/Madrid', label: t('Madrid (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Spain', iso: 'CET' },
    { value: 'Europe/Amsterdam', label: t('Amsterdam (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Netherlands', iso: 'CET' },
    { value: 'Europe/Brussels', label: t('Brussels (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Belgium', iso: 'CET' },
    { value: 'Europe/Zurich', label: t('Zurich (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Switzerland', iso: 'CET' },
    { value: 'Europe/Vienna', label: t('Vienna (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Austria', iso: 'CET' },
    { value: 'Europe/Prague', label: t('Prague (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Czech Republic', iso: 'CET' },
    { value: 'Europe/Warsaw', label: t('Warsaw (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Poland', iso: 'CET' },
    { value: 'Europe/Stockholm', label: t('Stockholm (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Sweden', iso: 'CET' },
    { value: 'Europe/Oslo', label: t('Oslo (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Norway', iso: 'CET' },
    { value: 'Europe/Copenhagen', label: t('Copenhagen (GMT+1:00/+2:00)'), offset: '+1:00/+2:00', country: 'Denmark', iso: 'CET' },
    { value: 'Europe/Helsinki', label: t('Helsinki (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: 'Finland', iso: 'EET' },
    
    { value: 'Europe/Athens', label: t('Athens (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: 'Greece', iso: 'EET' },
    { value: 'Europe/Bucharest', label: t('Bucharest (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: 'Romania', iso: 'EET' },
    { value: 'Europe/Sofia', label: t('Sofia (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: 'Bulgaria', iso: 'EET' },
    { value: 'Europe/Kiev', label: t('Kiev (GMT+2:00/+3:00)'), offset: '+2:00/+3:00', country: 'Ukraine', iso: 'EET' },
    
    { value: 'Europe/Moscow', label: t('Moscow (GMT+3:00)'), offset: '+3:00', country: 'Russia', iso: 'MSK' },
    { value: 'Europe/Istanbul', label: t('Istanbul (GMT+3:00)'), offset: '+3:00', country: 'Turkey', iso: 'TRT' },
    
    // Asia
    { value: 'Asia/Dubai', label: t('Dubai (GMT+4:00)'), offset: '+4:00', country: 'United Arab Emirates', iso: 'GST' },
    { value: 'Asia/Qatar', label: t('Doha (GMT+3:00)'), offset: '+3:00', country: 'Qatar', iso: 'AST' },
    { value: 'Asia/Kuwait', label: t('Kuwait City (GMT+3:00)'), offset: '+3:00', country: 'Kuwait', iso: 'AST' },
    { value: 'Asia/Riyadh', label: t('Riyadh (GMT+3:00)'), offset: '+3:00', country: 'Saudi Arabia', iso: 'AST' },
    
    { value: 'Asia/Tehran', label: t('Tehran (GMT+3:30/+4:30)'), offset: '+3:30/+4:30', country: 'Iran', iso: 'IRST' },
    { value: 'Asia/Kabul', label: t('Kabul (GMT+4:30)'), offset: '+4:30', country: 'Afghanistan', iso: 'AFT' },
    
    { value: 'Asia/Karachi', label: t('Karachi (GMT+5:00)'), offset: '+5:00', country: 'Pakistan', iso: 'PKT' },
    { value: 'Asia/Kolkata', label: t('Kolkata (GMT+5:30)'), offset: '+5:30', country: 'India', iso: 'IST' },
    { value: 'Asia/Mumbai', label: t('Mumbai (GMT+5:30)'), offset: '+5:30', country: 'India', iso: 'IST' },
    { value: 'Asia/Delhi', label: t('New Delhi (GMT+5:30)'), offset: '+5:30', country: 'India', iso: 'IST' },
    { value: 'Asia/Bangalore', label: t('Bangalore (GMT+5:30)'), offset: '+5:30', country: 'India', iso: 'IST' },
    { value: 'Asia/Chennai', label: t('Chennai (GMT+5:30)'), offset: '+5:30', country: 'India', iso: 'IST' },
    
    { value: 'Asia/Kathmandu', label: t('Kathmandu (GMT+5:45)'), offset: '+5:45', country: 'Nepal', iso: 'NPT' },
    { value: 'Asia/Dhaka', label: t('Dhaka (GMT+6:00)'), offset: '+6:00', country: 'Bangladesh', iso: 'BST' },
    { value: 'Asia/Colombo', label: t('Colombo (GMT+5:30)'), offset: '+5:30', country: 'Sri Lanka', iso: 'SLST' },
    
    { value: 'Asia/Yangon', label: t('Yangon (GMT+6:30)'), offset: '+6:30', country: 'Myanmar', iso: 'MMT' },
    { value: 'Asia/Bangkok', label: t('Bangkok (GMT+7:00)'), offset: '+7:00', country: 'Thailand', iso: 'ICT' },
    { value: 'Asia/Ho_Chi_Minh', label: t('Ho Chi Minh City (GMT+7:00)'), offset: '+7:00', country: 'Vietnam', iso: 'ICT' },
    { value: 'Asia/Phnom_Penh', label: t('Phnom Penh (GMT+7:00)'), offset: '+7:00', country: 'Cambodia', iso: 'ICT' },
    { value: 'Asia/Vientiane', label: t('Vientiane (GMT+7:00)'), offset: '+7:00', country: 'Laos', iso: 'ICT' },
    
    { value: 'Asia/Shanghai', label: t('Shanghai (GMT+8:00)'), offset: '+8:00', country: 'China', iso: 'CST' },
    { value: 'Asia/Beijing', label: t('Beijing (GMT+8:00)'), offset: '+8:00', country: 'China', iso: 'CST' },
    { value: 'Asia/Hong_Kong', label: t('Hong Kong (GMT+8:00)'), offset: '+8:00', country: 'Hong Kong', iso: 'HKT' },
    { value: 'Asia/Macau', label: t('Macau (GMT+8:00)'), offset: '+8:00', country: 'Macau', iso: 'CST' },
    { value: 'Asia/Taipei', label: t('Taipei (GMT+8:00)'), offset: '+8:00', country: 'Taiwan', iso: 'CST' },
    { value: 'Asia/Singapore', label: t('Singapore (GMT+8:00)'), offset: '+8:00', country: 'Singapore', iso: 'SGT' },
    { value: 'Asia/Kuala_Lumpur', label: t('Kuala Lumpur (GMT+8:00)'), offset: '+8:00', country: 'Malaysia', iso: 'MYT' },
    { value: 'Asia/Manila', label: t('Manila (GMT+8:00)'), offset: '+8:00', country: 'Philippines', iso: 'PHT' },
    { value: 'Asia/Jakarta', label: t('Jakarta (GMT+7:00)'), offset: '+7:00', country: 'Indonesia', iso: 'WIB' },
    
    { value: 'Asia/Tokyo', label: t('Tokyo (GMT+9:00)'), offset: '+9:00', country: 'Japan', iso: 'JST' },
    { value: 'Asia/Seoul', label: t('Seoul (GMT+9:00)'), offset: '+9:00', country: 'South Korea', iso: 'KST' },
    { value: 'Asia/Pyongyang', label: t('Pyongyang (GMT+9:00)'), offset: '+9:00', country: 'North Korea', iso: 'KST' },
    
    // Africa
    { value: 'Africa/Cairo', label: t('Cairo (GMT+2:00)'), offset: '+2:00', country: 'Egypt', iso: 'EET' },
    { value: 'Africa/Lagos', label: t('Lagos (GMT+1:00)'), offset: '+1:00', country: 'Nigeria', iso: 'WAT' },
    { value: 'Africa/Johannesburg', label: t('Johannesburg (GMT+2:00)'), offset: '+2:00', country: 'South Africa', iso: 'SAST' },
    { value: 'Africa/Nairobi', label: t('Nairobi (GMT+3:00)'), offset: '+3:00', country: 'Kenya', iso: 'EAT' },
    { value: 'Africa/Addis_Ababa', label: t('Addis Ababa (GMT+3:00)'), offset: '+3:00', country: 'Ethiopia', iso: 'EAT' },
    { value: 'Africa/Casablanca', label: t('Casablanca (GMT+1:00)'), offset: '+1:00', country: 'Morocco', iso: 'WEST' },
    { value: 'Africa/Tunis', label: t('Tunis (GMT+1:00)'), offset: '+1:00', country: msg('Tunisia'), iso: 'CET' },
    { value: 'Africa/Algiers', label: t('Algiers (GMT+1:00)'), offset: '+1:00', country: msg('Algeria'), iso: 'CET' },
    
    // Oceania
    { value: 'Australia/Sydney', label: t('Sydney (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: 'Australia', iso: 'AEST' },
    { value: 'Australia/Melbourne', label: t('Melbourne (GMT+10:00/+11:00)'), offset: '+10:00/+11:00', country: 'Australia', iso: 'AEST' },
    { value: 'Australia/Brisbane', label: t('Brisbane (GMT+10:00)'), offset: '+10:00', country: 'Australia', iso: 'AEST' },
    { value: 'Australia/Perth', label: t('Perth (GMT+8:00)'), offset: '+8:00', country: 'Australia', iso: 'AWST' },
    { value: 'Australia/Adelaide', label: t('Adelaide (GMT+9:30/+10:30)'), offset: '+9:30/+10:30', country: 'Australia', iso: 'ACST' },
    { value: 'Australia/Darwin', label: t('Darwin (GMT+9:30)'), offset: '+9:30', country: 'Australia', iso: 'ACST' },
    
    { value: 'Pacific/Auckland', label: t('Auckland (GMT+12:00/+13:00)'), offset: '+12:00/+13:00', country: 'New Zealand', iso: 'NZST' },
    { value: 'Pacific/Fiji', label: t('Suva (GMT+12:00)'), offset: '+12:00', country: 'Fiji', iso: 'FJT' },
    { value: 'Pacific/Noumea', label: t('Noumea (GMT+11:00)'), offset: '+11:00', country: 'New Caledonia', iso: 'NCT' },
    { value: 'Pacific/Port_Moresby', label: t('Port Moresby (GMT+10:00)'), offset: '+10:00', country: 'Papua New Guinea', iso: 'PGT' },
    
    // Pacific Islands
    { value: 'Pacific/Honolulu', label: t('Honolulu (GMT-10:00)'), offset: '-10:00', country: 'United States', iso: 'HST' },
    { value: 'Pacific/Samoa', label: t('Apia (GMT+13:00)'), offset: '+13:00', country: 'Samoa', iso: 'WSST' },
    { value: 'Pacific/Tongatapu', label: t('Nuku\'alofa (GMT+13:00)'), offset: '+13:00', country: 'Tonga', iso: 'TOT' },
    { value: 'Pacific/Kiritimati', label: t('Kiritimati (GMT+14:00)'), offset: '+14:00', country: 'Kiribati', iso: 'LINT' }
  ];

  useEffect(() => {
    // Load from URL params
    const urlParams = getUrlParams();
    const epochParam = urlParams.get('epoch');
    const timezoneParam = urlParams.get('timezone');
    const timezonesParam = urlParams.get('timezones');
    const humanParam = urlParams.get('human');
    
    if (epochParam) {
      setEpochTime(epochParam);
      autoDetectFormat(epochParam);
    }
    if (timezoneParam) setSelectedTimezone(timezoneParam);
    if (timezonesParam) {
      try {
        const decodedTimezones = JSON.parse(decodeURIComponent(timezonesParam));
        if (Array.isArray(decodedTimezones) && decodedTimezones.length > 0) {
          setSelectedTimezones(decodedTimezones);
          if (!timezoneParam && decodedTimezones.length > 0) {
            setSelectedTimezone(decodedTimezones[0]);
          }
        }
      } catch (error) {
        console.error('Error parsing timezones from URL:', error);
      }
    }
    if (humanParam) setHumanTime(humanParam);

    // Initialize timezone service with saved preferences
    const savedTimezones = timezoneService.getSelectedTimezones();
    const primaryTimezone = timezoneService.getPrimaryTimezone();
    const detectedUserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    setUserTimezone(detectedUserTimezone);
    
    if (savedTimezones.length > 0) {
      setSelectedTimezones(savedTimezones);
      setSelectedTimezone(primaryTimezone);
    }
  }, []);

  const autoDetectFormat = (timestamp: string) => {
    const unit = detectEpochUnit(timestamp);
    if (unit) setDetectedFormat(unit);
  };

  const convertFromEpoch = () => {
    try {
      const date = epochToDate(epochTime, detectedFormat);
      if (!date) throw new Error('Invalid Unix timestamp');
      // datetime-local inputs hold local wall time, so fill it with local time (not UTC).
      setHumanTime(toDatetimeLocal(date));
      setConvertedDate(date);
      
      // Update URL params
      updateUrlParams({ 
        epoch: epochTime, 
        timezone: selectedTimezone,
        timezones: encodeURIComponent(JSON.stringify(selectedTimezones))
      });
      
      trackAction('epoch_convert_from', { format: detectedFormat, timezone: selectedTimezone });
    } catch (error) {
      toast({ 
        title: t('Error'), 
        description: t('Invalid Unix timestamp'), 
        variant: "destructive" 
      });
    }
  };

  const convertToEpoch = () => {
    try {
      const converted = datetimeLocalToEpoch(humanTime, detectedFormat);
      if (!converted) throw new Error('Invalid date format');
      const { epoch, date } = converted;
      setEpochTime(epoch);
      setConvertedDate(date);
      
      // Update URL params
      updateUrlParams({ 
        human: humanTime, 
        timezone: selectedTimezone,
        timezones: encodeURIComponent(JSON.stringify(selectedTimezones))
      });
      
      trackAction('epoch_convert_to', { format: detectedFormat, timezone: selectedTimezone });
    } catch (error) {
      toast({ 
        title: t('Error'), 
        description: t('Invalid date format'), 
        variant: "destructive" 
      });
    }
  };

  const getCurrentEpoch = () => {
    let current = Date.now();
    
    if (detectedFormat === 'seconds') {
      current = Math.floor(current / 1000);
    } else if (detectedFormat === 'nanoseconds') {
      current = current * 1000000;
    }
    
    setEpochTime(current.toString());
    setConvertedDate(new Date());
    
    updateUrlParams({ 
      epoch: current.toString(),
      timezone: selectedTimezone,
      timezones: encodeURIComponent(JSON.stringify(selectedTimezones))
    });
    trackAction('epoch_current', { format: detectedFormat });
  };

  const formatTimeInTimezone = (date: Date, timezone: string) => {
    try {
      return fmt.date(date, {
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
      return t('Invalid timezone');
    }
  };

  const getTimezoneInfo = (date: Date, timezone: string) => {
    try {
      // Get the timezone abbreviation
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'short'
      });
      const parts = formatter.formatToParts(date);
      const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';
      
      // Get the GMT offset
      const offsetFormatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      });
      const offsetParts = offsetFormatter.formatToParts(date);
      const offset = offsetParts.find(part => part.type === 'timeZoneName')?.value || '';
      
      return { abbreviation: timeZoneName, offset };
    } catch (error) {
      return { abbreviation: '', offset: '' };
    }
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    const isPast = now.getTime() > date.getTime();
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);
    
    const parts: string[] = [];

    if (years > 0) {
      parts.push(years === 1 ? t('1 year') : t('{n} years', { n: years }));
    }
    if (days % 365 > 0) {
      const n = days % 365;
      parts.push(n === 1 ? t('1 day') : t('{n} days', { n }));
    }
    if (hours % 24 > 0) {
      const n = hours % 24;
      parts.push(t(msg.plural(n, { one: '1 hour', other: '{n} hours' }), { n }));
    }
    if (minutes % 60 > 0) {
      const n = minutes % 60;
      parts.push(t(msg.plural(n, { one: '1 minute', other: '{n} minutes' }), { n }));
    }
    if (seconds % 60 > 0) {
      const n = seconds % 60;
      parts.push(t(msg.plural(n, { one: '1 second', other: '{n} seconds' }), { n }));
    }

    const duration = parts.join(' ');
    return isPast ? t('{duration} ago', { duration }) : t('{duration} from now', { duration });
  };

  /** `label` is an English msg() source; `timezone` fills a "{timezone} time" label. Analytics keeps the English label. */
  const copyToClipboard = (text: string, label: string, timezone?: string) => {
    navigator.clipboard.writeText(text);
    trackAction('epoch_copy', { type: timezone ? label.replace('{timezone}', timezone) : label });
    toast({
      title: t('Copied!'),
      description: t('{label} copied to clipboard', { label: t(label, timezone ? { timezone } : undefined) }),
    });
  };

  const shareCurrentState = () => {
    const url = new URL(window.location.href);
    if (epochTime) url.searchParams.set('epoch', epochTime);
    if (humanTime) url.searchParams.set('human', humanTime);
    url.searchParams.set('timezone', selectedTimezone);
    url.searchParams.set('timezones', encodeURIComponent(JSON.stringify(selectedTimezones)));
    
    navigator.clipboard.writeText(url.toString());
    trackAction('epoch_share');
    toast({
      title: t('Link Copied!'),
      description: t('Shareable link copied to clipboard'),
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleEpochChange = (value: string) => {
    setEpochTime(value);
    if (value) {
      autoDetectFormat(value);
    }
  };

  // Handle ESC key for fullscreen exit
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', convertedDate ? convertedDate.getTime() : '');

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-black dark:text-white flex items-center">
                <Clock className="h-8 w-8 mr-3 text-blue-600 dark:text-blue-400" />
                {t('Unix Epoch Converter')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">{t('Convert between Unix timestamps and human-readable time')}</p>
              <div className="flex space-x-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950">{t('Unix')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950">{t('Timestamp')}</Badge>
                <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950">{t('Auto-detect')}</Badge>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300 dark:border-gray-600">
                <Minimize2 className="h-5 w-5 mr-2" />
                {t('Exit Fullscreen')}
              </Button>
              <Button
                onClick={shareCurrentState}
                variant="outline"
                className="border-2 border-gray-300 dark:border-gray-600"
              >
                <Share2 className="h-4 w-4 mr-2" />
                {t('Share')}
              </Button>
            </div>
          </div>

          <FullscreenContent 
            epochTime={epochTime}
            humanTime={humanTime}
            selectedTimezone={selectedTimezone}
            selectedTimezones={selectedTimezones}
            userTimezone={userTimezone}
            convertedDate={convertedDate}
            detectedFormat={detectedFormat}
            activeTab={activeTab}
            timezones={timezones}
            handleEpochChange={handleEpochChange}
            setHumanTime={setHumanTime}
            setSelectedTimezone={setSelectedTimezone}
            setSelectedTimezones={setSelectedTimezones}
            setActiveTab={setActiveTab}
            convertFromEpoch={convertFromEpoch}
            convertToEpoch={convertToEpoch}
            getCurrentEpoch={getCurrentEpoch}
            copyToClipboard={copyToClipboard}
            formatTimeInTimezone={formatTimeInTimezone}
            getTimezoneInfo={getTimezoneInfo}
            getRelativeTime={getRelativeTime}
            updateUrlParams={updateUrlParams}
          />
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Time Tools'), href: "/category/development-tech/time-tools" }}
            toolName="Unix Epoch Converter"
          />
          
          <div className="tool-header mt-3">
            <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
              <Clock className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
              {t('Unix Epoch Converter')}
            </h1>
            <div className="ml-11 sm:ml-13 -mt-1">
              <p className="tool-description text-gray-600 text-sm sm:text-base">{t('Convert between Unix timestamps and human-readable time across different timezones')}</p>
              <div className="flex space-x-3 mt-1">
                <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950">{t('Unix')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950">{t('Timestamp')}</Badge>
                <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950">{t('Converter')}</Badge>
              </div>
            </div>
          </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg mt-2">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-black dark:text-white flex items-center text-xl font-semibold">
                  <Clock className="h-6 w-6 mr-3 text-blue-600 dark:text-blue-400" />
                  {t('Unix Epoch Converter')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {t('Automatically detects timestamp format (seconds/milliseconds/nanoseconds)')}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Button onClick={shareCurrentState} variant="ghost" size="icon" className="h-8 w-8">
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button onClick={toggleFullscreen} variant="ghost" size="icon" className="h-8 w-8">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="from-epoch" className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>{t('From Epoch')}</span>
                </TabsTrigger>
                <TabsTrigger value="to-epoch" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>{t('To Epoch')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="from-epoch" className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-black dark:text-white block">
                    {t('Unix Timestamp')}
                  </label>
                  <div className="flex space-x-3">
                    <Input
                      value={epochTime}
                      onChange={(e) => handleEpochChange(e.target.value)}
                      placeholder={t('1640995200 or 1640995200000')}
                      className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                    />
                    <Button 
                      onClick={getCurrentEpoch} 
                      variant="outline" 
                      className="border-gray-300 dark:border-gray-600"
                    >
                      {t('Now')}
                    </Button>
                    {epochTime && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(epochTime, msg('Unix timestamp'))}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <Button 
                  onClick={convertFromEpoch} 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {t('Convert from Epoch')}
                </Button>
              </TabsContent>

              <TabsContent value="to-epoch" className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-black dark:text-white block">{t('Human-Readable Time')}</label>
                  <div className="flex space-x-3">
                    <Input
                      type="datetime-local"
                      value={humanTime}
                      onChange={(e) => setHumanTime(e.target.value)}
                      className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                    />
                    {humanTime && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(humanTime, msg('Human time'))}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <Button 
                  onClick={convertToEpoch} 
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {t('Convert to Epoch')}
                </Button>
              </TabsContent>
            </Tabs>

            <TimezoneSelector
              selectedTimezones={selectedTimezones}
              primaryTimezone={selectedTimezone}
              onTimezonesChange={setSelectedTimezones}
              onPrimaryTimezoneChange={setSelectedTimezone}
              showColorCoding={true}
            />

            {/* Converted Time Details */}
            {convertedDate && (
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-black dark:text-white">{t('Converted Time Details:')}</h4>
                
                {/* Selected Timezone */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {t('Time in {selectedTimezone}{value}:', { selectedTimezone, value: (() => {
                      const tzInfo = getTimezoneInfo(convertedDate, selectedTimezone);
                      return tzInfo.abbreviation || tzInfo.offset ? ` (${tzInfo.abbreviation} ${tzInfo.offset})` : '';
                    })() })}
                  </div>
                  <div className="text-black dark:text-white font-mono text-sm flex items-center justify-between">
                    <span className="break-all">{formatTimeInTimezone(convertedDate, selectedTimezone)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, selectedTimezone), msg('{timezone} time'), selectedTimezone)}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Time in UTC (In ISO format) */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Time in UTC (In ISO format):')}</div>
                  <div className="text-black dark:text-white font-mono text-sm flex items-center justify-between">
                    <span className="break-all">{convertedDate.toISOString().replace('T', ' ').replace('Z', ' UTC')}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(convertedDate.toISOString().replace('T', ' ').replace('Z', ' UTC'), msg('UTC time'))}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Additional Timezones */}
                {selectedTimezones.filter(tz => tz !== selectedTimezone).map((timezone) => (
                  <div key={timezone} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-between">
                      <span>
                        {t('Time in {timezone}{value}:', { timezone, value: (() => {
                          const tzInfo = getTimezoneInfo(convertedDate, timezone);
                          return tzInfo.abbreviation || tzInfo.offset ? ` (${tzInfo.abbreviation} ${tzInfo.offset})` : '';
                        })() })}
                      </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const newTimezones = selectedTimezones.filter(tz => tz !== timezone);
                        setSelectedTimezones(newTimezones);
                        // Update URL immediately
                        updateUrlParams({ 
                          timezone: selectedTimezone,
                          timezones: encodeURIComponent(JSON.stringify(newTimezones))
                        });
                      }}
                      className="text-gray-500 hover:text-red-500 p-1 h-6 w-6"
                    >
                        ×
                      </Button>
                    </div>
                    <div className="text-black dark:text-white font-mono text-sm flex items-center justify-between">
                      <span className="break-all">{formatTimeInTimezone(convertedDate, timezone)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, timezone), msg('{timezone} time'), timezone)}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* User's Local Time */}
                {userTimezone && userTimezone !== selectedTimezone && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Your Local Time ({userTimezone}):', { userTimezone })}</div>
                    <div className="text-black dark:text-white font-mono text-sm flex items-center justify-between">
                      <span className="break-all">{formatTimeInTimezone(convertedDate, userTimezone)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, userTimezone), msg('Local time'))}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Relative Time */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Relative Time:')}</div>
                  <div className="text-black dark:text-white font-mono text-sm flex items-center justify-between">
                    <span className="break-all">{getRelativeTime(convertedDate)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(getRelativeTime(convertedDate), msg('Relative time'))}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Current Unix Timestamp:')}</div>
              <div className="text-black dark:text-white font-mono text-lg flex items-center justify-between">
                <span className="break-all">
                  {detectedFormat === 'seconds' 
                    ? Math.floor(Date.now() / 1000)
                    : detectedFormat === 'milliseconds' 
                    ? Date.now()
                    : Date.now() * 1000000
                  }
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(
                    (detectedFormat === 'seconds' 
                      ? Math.floor(Date.now() / 1000)
                      : detectedFormat === 'milliseconds' 
                      ? Date.now()
                      : Date.now() * 1000000
                    ).toString(), 
                    msg('Current timestamp')
                  )}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        </div>
      </div>
    </>
  );
};

// Fullscreen content component
const FullscreenContent = ({ 
  epochTime, 
  humanTime, 
  selectedTimezone, 
  selectedTimezones,
  userTimezone, 
  convertedDate, 
  detectedFormat, 
  activeTab, 
  timezones,
  timezoneOpen,
  setTimezoneOpen,
  handleEpochChange, 
  setHumanTime, 
  setSelectedTimezone, 
  setSelectedTimezones,
  setActiveTab, 
  convertFromEpoch, 
  convertToEpoch, 
  getCurrentEpoch, 
  copyToClipboard, 
  formatTimeInTimezone, 
  getTimezoneInfo,
  getRelativeTime,
  updateUrlParams
}: any) => {
  const { t } = useT();
  return (
  <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
    <CardHeader>
      <CardTitle className="text-black dark:text-white flex items-center text-xl">
        <Clock className="h-6 w-6 mr-3 text-blue-600 dark:text-blue-400" />
        {t('Unix Epoch Converter')}
      </CardTitle>
      <CardDescription className="text-gray-600 dark:text-gray-400">
        {t('Automatically detects timestamp format (seconds/milliseconds/nanoseconds)')}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="from-epoch" className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>{t('From Epoch')}</span>
          </TabsTrigger>
          <TabsTrigger value="to-epoch" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>{t('To Epoch')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="from-epoch" className="space-y-4">
          <div className="space-y-3">
            <label className="text-sm font-medium text-black dark:text-white block">
              {t('Unix Timestamp')}
            </label>
            <div className="flex space-x-3">
              <Input
                value={epochTime}
                onChange={(e) => handleEpochChange(e.target.value)}
                placeholder={t('1640995200 or 1640995200000')}
                className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
              />
              <Button 
                onClick={getCurrentEpoch} 
                variant="outline" 
                className="border-gray-300 dark:border-gray-600"
              >
                {t('Now')}
              </Button>
              {epochTime && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(epochTime, msg('Unix timestamp'))}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          
          <Button 
            onClick={convertFromEpoch} 
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            {t('Convert from Epoch')}
          </Button>
        </TabsContent>

        <TabsContent value="to-epoch" className="space-y-4">
          <div className="space-y-3">
            <label className="text-sm font-medium text-black dark:text-white block">{t('Human-Readable Time')}</label>
            <div className="flex space-x-3">
              <Input
                type="datetime-local"
                value={humanTime}
                onChange={(e) => setHumanTime(e.target.value)}
                className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
              />
              {humanTime && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(humanTime, msg('Human time'))}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Button 
            onClick={convertToEpoch} 
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            {t('Convert to Epoch')}
          </Button>
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <label className="text-sm font-medium text-black dark:text-white block">{t('Display Timezones')}</label>
        <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={timezoneOpen}
              className="w-full justify-between bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            >
              {selectedTimezone
                ? (() => {
                    const tz = timezones.find((timezone) => timezone.value === selectedTimezone);
                    return tz ? t('{country}, {city}', { country: t(tz.country), city: tz.label }) : selectedTimezone;
                  })()
                : t('Select timezone...')}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
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
                    timezone.value.toLowerCase().includes(searchLower)) {
                  return 1;
                }
                
                return 0;
              }}
            >
              <CommandInput 
                placeholder={t('Search timezone, country, or ISO code...')} 
                onValueChange={(search) => {
                  // Search functionality handled by cmdk
                }}
              />
              <CommandList>
                <CommandEmpty>{t('No timezone found.')}</CommandEmpty>
                <CommandGroup>
                  {timezones.map((timezone) => {
                    // Use data attributes for custom search
                    const searchData = `${timezone.country} ${timezone.iso} ${timezone.label} ${timezone.value}`;
                    return (
                      <CommandItem
                        key={timezone.value}
                        value={searchData}
                        onSelect={() => {
                          if (!selectedTimezones.includes(timezone.value)) {
                            const newTimezones = [...selectedTimezones, timezone.value];
                            setSelectedTimezones(newTimezones);
                            // Update URL immediately
                            updateUrlParams({ 
                              timezone: selectedTimezone,
                              timezones: encodeURIComponent(JSON.stringify(newTimezones))
                            });
                          }
                          setSelectedTimezone(timezone.value);
                          setTimezoneOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedTimezones.includes(timezone.value) ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        {t('{country}, {city}', { country: t(timezone.country), city: timezone.label })}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        
        {/* Show selected timezones as badges */}
        {selectedTimezones.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedTimezones.map((timezone) => (
              <Badge
                key={timezone}
                variant="secondary"
                className="flex items-center gap-1 text-xs"
              >
                {(() => {
                  const tz = timezones.find(tz => tz.value === timezone);
                  return tz ? t('{country}, {city}', { country: t(tz.country), city: tz.label.split(' ')[0] }) : timezone;
                })()}
                {timezone !== 'UTC' && (
                  <button
                    onClick={() => {
                      const newTimezones = selectedTimezones.filter(tz => tz !== timezone);
                      setSelectedTimezones(newTimezones);
                      // Update URL immediately
                      updateUrlParams({ 
                        timezone: selectedTimezone,
                        timezones: encodeURIComponent(JSON.stringify(newTimezones))
                      });
                    }}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Rest of the converted time content - same as regular view but larger */}
      {convertedDate && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-lg font-medium text-black dark:text-white">{t('Converted Time Details:')}</h4>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {t('Time in {selectedTimezone}{value}:', { selectedTimezone, value: (() => {
                  const tzInfo = getTimezoneInfo(convertedDate, selectedTimezone);
                  return tzInfo.abbreviation || tzInfo.offset ? ` (${tzInfo.abbreviation} ${tzInfo.offset})` : '';
                })() })}
              </div>
              <div className="text-black dark:text-white font-mono text-base flex items-center justify-between">
                <span className="break-all">{formatTimeInTimezone(convertedDate, selectedTimezone)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, selectedTimezone), msg('{timezone} time'), selectedTimezone)}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Time in UTC (In ISO format):')}</div>
              <div className="text-black dark:text-white font-mono text-base flex items-center justify-between">
                <span className="break-all">{convertedDate.toISOString().replace('T', ' ').replace('Z', ' UTC')}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(convertedDate.toISOString().replace('T', ' ').replace('Z', ' UTC'), msg('UTC time'))}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Additional Timezones */}
            {selectedTimezones.filter(tz => tz !== selectedTimezone).map((timezone) => (
              <div key={timezone} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-between">
                  <span>
                    {t('Time in {timezone}{value}:', { timezone, value: (() => {
                      const tzInfo = getTimezoneInfo(convertedDate, timezone);
                      return tzInfo.abbreviation || tzInfo.offset ? ` (${tzInfo.abbreviation} ${tzInfo.offset})` : '';
                    })() })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newTimezones = selectedTimezones.filter(tz => tz !== timezone);
                      setSelectedTimezones(newTimezones);
                      // Update URL immediately
                      updateUrlParams({ 
                        timezone: selectedTimezone,
                        timezones: encodeURIComponent(JSON.stringify(newTimezones))
                      });
                    }}
                    className="text-gray-500 hover:text-red-500 p-1 h-6 w-6"
                  >
                    ×
                  </Button>
                </div>
                <div className="text-black dark:text-white font-mono text-base flex items-center justify-between">
                  <span className="break-all">{formatTimeInTimezone(convertedDate, timezone)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, timezone), msg('{timezone} time'), timezone)}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {userTimezone && userTimezone !== selectedTimezone && (
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Your Local Time ({userTimezone}):', { userTimezone })}</div>
                <div className="text-black dark:text-white font-mono text-base flex items-center justify-between">
                  <span className="break-all">{formatTimeInTimezone(convertedDate, userTimezone)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(formatTimeInTimezone(convertedDate, userTimezone), msg('Local time'))}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Relative Time:')}</div>
              <div className="text-black dark:text-white font-mono text-base flex items-center justify-between">
                <span className="break-all">{getRelativeTime(convertedDate)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(getRelativeTime(convertedDate), msg('Relative time'))}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('Current Unix Timestamp:')}</div>
        <div className="text-black dark:text-white font-mono text-xl flex items-center justify-between">
          <span className="break-all">
            {detectedFormat === 'seconds' 
              ? Math.floor(Date.now() / 1000)
              : detectedFormat === 'milliseconds' 
              ? Date.now()
              : Date.now() * 1000000
            }
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copyToClipboard(
              (detectedFormat === 'seconds' 
                ? Math.floor(Date.now() / 1000)
                : detectedFormat === 'milliseconds' 
                ? Date.now()
                : Date.now() * 1000000
              ).toString(), 
              msg('Current timestamp')
            )}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
);
};

export default EpochConverter;