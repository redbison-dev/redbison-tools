import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, X, Plus } from 'lucide-react';
import { timezoneService, TIMEZONES } from '@/utils/timezoneService';
import { useT } from '@/i18n';

interface TimezoneSelectorProps {
  selectedTimezones: string[];
  primaryTimezone: string;
  onTimezonesChange: (timezones: string[]) => void;
  onPrimaryTimezoneChange: (timezone: string) => void;
  className?: string;
  placeholder?: string;
  showColorCoding?: boolean;
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  selectedTimezones,
  primaryTimezone,
  onTimezonesChange,
  onPrimaryTimezoneChange,
  className = '',
  placeholder,
  showColorCoding = true
}) => {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(false);
  /** "United States, New York": country and city (the label up to " (GMT..."), both from the catalog. */
  const place = (country: string, label: string) => t('{country}, {city}', { country: t(country), city: t(label).split(' (')[0] });

  const handleAddTimezone = (timezone: string) => {
    if (!selectedTimezones.includes(timezone)) {
      const newTimezones = [...selectedTimezones, timezone];
      timezoneService.addTimezone(timezone);
      onTimezonesChange(newTimezones);
    }
    
    if (!primaryTimezone || primaryTimezone === timezone) {
      onPrimaryTimezoneChange(timezone);
      timezoneService.setPrimaryTimezone(timezone);
    }
    
    setIsOpen(false);
  };

  const handleRemoveTimezone = (timezone: string) => {
    if (timezone !== 'UTC' && selectedTimezones.length > 1) {
      const newTimezones = selectedTimezones.filter(tz => tz !== timezone);
      timezoneService.removeTimezone(timezone);
      onTimezonesChange(newTimezones);
      
      // If removing primary timezone, set new primary
      if (primaryTimezone === timezone) {
        const newPrimary = newTimezones[0];
        onPrimaryTimezoneChange(newPrimary);
        timezoneService.setPrimaryTimezone(newPrimary);
      }
    }
  };

  const handleSetPrimary = (timezone: string) => {
    onPrimaryTimezoneChange(timezone);
    timezoneService.setPrimaryTimezone(timezone);
  };

  const getTimezoneDisplay = (timezone: string) => {
    const data = timezoneService.getTimezoneData(timezone);
    if (!data) return timezone;
    
    return place(data.country, data.label);
  };

  const getTimezoneColor = (timezone: string) => {
    return showColorCoding ? timezoneService.getTimezoneColor(timezone) : {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-800 dark:text-gray-200',
      border: 'border-gray-200 dark:border-gray-600',
      accent: 'gray'
    };
  };

  const groupedTimezones = timezoneService.getTimezonesByRegion();

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{t('Display Timezones')}</label>
        <span className="text-xs text-muted-foreground">
          {t('{count} selected', { count: selectedTimezones.length })}
        </span>
      </div>

      {/* Primary timezone selector */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className="w-full justify-between bg-background border-border hover:bg-accent"
          >
            <span className="truncate">
              {primaryTimezone ? getTimezoneDisplay(primaryTimezone) : placeholder ?? t('Select timezone...')}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-popover border-border shadow-lg" align="start">
          <Command className="bg-popover">
            <CommandInput 
              placeholder={t('Search timezones, countries, or cities...')}
              className="border-0 focus:ring-0"
            />
            <CommandList className="max-h-[300px] overflow-auto">
              <CommandEmpty>{t('No timezone found.')}</CommandEmpty>
              {Object.entries(groupedTimezones).map(([region, timezones]) => (
                <CommandGroup key={region} heading={t(region)}>
                  {timezones.map((timezone) => (
                    <CommandItem
                      key={timezone.value}
                      value={`${t(timezone.country)} ${t(timezone.label)} ${timezone.value} ${timezone.iso}`}
                      onSelect={() => handleAddTimezone(timezone.value)}
                      className="cursor-pointer hover:bg-accent"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              selectedTimezones.includes(timezone.value) ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{place(timezone.country, timezone.label)}</span>
                            <span className="text-xs text-muted-foreground">{timezone.offset} • {timezone.iso}</span>
                          </div>
                        </div>
                        {showColorCoding && selectedTimezones.includes(timezone.value) && (
                          <div 
                            className={`w-3 h-3 rounded-full ${getTimezoneColor(timezone.value).bg.replace('bg-', 'bg-').replace('dark:bg-', 'dark:bg-').replace('/30', '')}`}
                          />
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {/* Selected timezones display */}
      {selectedTimezones.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t('Selected Timezones:')}</div>
          <div className="flex flex-wrap gap-2">
            {selectedTimezones.map((timezone) => {
              const color = getTimezoneColor(timezone);
              const isPrimary = timezone === primaryTimezone;
              
              return (
                <Badge
                  key={timezone}
                  variant="secondary"
                  className={`
                    flex items-center gap-1 text-xs transition-all duration-200 cursor-pointer
                    ${color.bg} ${color.text} ${color.border} border
                    ${isPrimary ? 'ring-2 ring-primary ring-offset-1 font-semibold' : 'hover:shadow-md'}
                  `}
                  onClick={() => !isPrimary && handleSetPrimary(timezone)}
                >
                  <div className="flex items-center gap-1">
                    {showColorCoding && (
                      <div className={`w-2 h-2 rounded-full ${color.bg.replace('bg-', 'bg-').replace('dark:bg-', 'dark:bg-').replace('/30', '')}`} />
                    )}
                    <span>{getTimezoneDisplay(timezone)}</span>
                    {isPrimary && (
                      <span className="text-xs font-bold">•</span>
                    )}
                  </div>
                  {timezone !== 'UTC' && selectedTimezones.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTimezone(timezone);
                      }}
                      className="ml-1 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              );
            })}
          </div>
          
          {/* Add more button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('Add Timezone')}
          </Button>
          
          {selectedTimezones.length > 1 && (
            <div className="text-xs text-muted-foreground mt-2">
              <span className="font-medium">{t('Primary:')}</span> {getTimezoneDisplay(primaryTimezone)} •
              <span className="ml-1">{t('Click any timezone to make it primary')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};