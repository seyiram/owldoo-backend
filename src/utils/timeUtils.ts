/**
 * Time utilities for date and time formatting
 */

/**
 * Formats a date to a readable string showing date and time
 * @param date Date to format
 * @param userTimezone Optional user timezone (defaults to system timezone)
 * @returns Formatted date string like "3:00 PM on Thursday, Mar 6"
 */
export function formatDateTime(date: Date, userTimezone?: string): string {
  // Get the user's timezone or use system default
  const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // IMPORTANT: Log detailed debugging info but don't modify the date
  console.log('FORMAT DATE TIME DEBUG:', {
    input: date.toString(),
    toLocaleString: date.toLocaleString(),
    iso: date.toISOString(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    currentDay: new Date().getDate(),
    timezone: timezone,
    timezoneOffset: date.getTimezoneOffset() / 60,
    isDateInFuture: date > new Date()
  });
  
  // Validate the date is in the future or past (just for logging)
  const now = new Date();
  const isDateInFuture = date > now;
  const daysDifference = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (isDateInFuture) {
    if (daysDifference < 1) {
      console.log('DATE VALIDATION: Event is scheduled for TODAY (less than 24 hours ahead)');
    } else if (daysDifference < 2) {
      console.log('DATE VALIDATION: Event is correctly scheduled for TOMORROW');
    } else {
      console.log(`DATE VALIDATION: Event is scheduled for ${daysDifference} days in the future`);
    }
  } else {
    console.log('DATE VALIDATION: Event is in the past - possible error');
  }
  
  // Format with proper timezone options
  const timeOptions: Intl.DateTimeFormatOptions = { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true,
    timeZone: timezone
  };
  
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric',
    timeZone: timezone
  };
  
  const timeString = new Intl.DateTimeFormat('en-US', timeOptions).format(date);
  const dateString = new Intl.DateTimeFormat('en-US', dateOptions).format(date);
  
  return `${timeString} on ${dateString}`;
}

/**
 * Converts a Date object to an ISO string in a specific timezone
 * @param date Date object to convert
 * @param timezone Target timezone (e.g. 'America/New_York')
 * @returns ISO string in the specified timezone
 */
export function dateToTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', { timeZone: timezone });
}

/**
 * Gets the time in 12-hour format (3:00 PM)
 * @param date The date to extract time from
 * @returns Formatted time string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
}

/**
 * Checks if a date is today
 * @param date The date to check
 * @returns True if the date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}