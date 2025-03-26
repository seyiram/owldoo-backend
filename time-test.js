// Time conversion testing script
const mongoose = require('mongoose');

// Simple time parsing test script that will show the issue
console.log('Running time parsing test...');

// Create a sample input with an 8pm time
const input = 'I want to spend time with my wife and daughter at 8pm';
console.log('Input text:', input);

// Call just the time parsing functions from nlp service
const extractTime = (input) => {
    // First, extract time expressions using regex
    const timeRegex = /(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i;
    const timeMatch = input.match(timeRegex);
    
    if (timeMatch) {
        const [fullMatch, hourStr, minuteStr, ampm] = timeMatch;
        let hour = parseInt(hourStr);
        let minute = minuteStr ? parseInt(minuteStr) : 0;
        
        console.log('Original time match:', {
            full: fullMatch,
            hour: hour,
            minute: minute,
            ampm: ampm
        });
        
        // Apply AM/PM logic to get 24-hour format
        if (ampm.toLowerCase() === 'pm' && hour < 12) {
            hour += 12;
        } else if (ampm.toLowerCase() === 'am' && hour === 12) {
            hour = 0;
        }
        
        console.log('After AM/PM conversion:', {
            hour24: hour,
            minute: minute
        });
        
        // Create a date with this time
        const date = new Date();
        date.setHours(hour, minute, 0, 0);
        
        return {
            timeStr: `${hour}:${minute.toString().padStart(2, '0')}`,
            date: date,
            isoString: date.toISOString()
        };
    }
    
    return null;
};

const convertToLocalTime = (isoTimeStr, originalText) => {
    // Parse the ISO string to create a Date object
    const parsedDate = new Date(isoTimeStr);
    
    console.log('DEBUG: convertToLocalTime:', {
        input: isoTimeStr,
        parsedDate: parsedDate.toString(),
        localString: parsedDate.toLocaleString(),
        hours: parsedDate.getHours(),
        minutes: parsedDate.getMinutes(),
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        systemTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: parsedDate.getTimezoneOffset() / 60,
        originalText: originalText
    });
    
    // Check if there's a specific time in the original text
    const timeRegex = /(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i;
    const timeMatch = originalText.match(timeRegex);
    
    if (timeMatch) {
        const [fullMatch, hourStr, minuteStr, ampm] = timeMatch;
        let originalHour = parseInt(hourStr);
        let originalMinute = minuteStr ? parseInt(minuteStr) : 0;
        
        console.log(`Found time in originalText: ${fullMatch} => ${originalHour}:${originalMinute}`);
        
        // Convert to 24-hour format
        if (ampm.toLowerCase() === 'pm' && originalHour < 12) {
            originalHour += 12;
        } else if (ampm.toLowerCase() === 'am' && originalHour === 12) {
            originalHour = 0;
        }
        
        // Check if there's a significant time difference
        const currentHour = parsedDate.getHours();
        const currentMinute = parsedDate.getMinutes();
        
        if (Math.abs(currentHour - originalHour) > 0 || Math.abs(currentMinute - originalMinute) > 5) {
            console.log(`TIME SHIFT DETECTED: Adjusting incorrectly shifted time from ${currentHour}:${currentMinute} to ${originalHour}:${originalMinute}`);
            
            // Create a new date with the correct time
            const correctedDate = new Date(parsedDate);
            correctedDate.setHours(originalHour, originalMinute, 0, 0);
            
            console.log(`Corrected date: ${correctedDate.toString()}`);
            return correctedDate;
        }
    }
    
    return parsedDate;
};

// Run the test
const timeInfo = extractTime(input);
console.log('Extracted time information:', timeInfo);

if (timeInfo) {
    const localTime = convertToLocalTime(timeInfo.isoString, input);
    console.log('Converted to local time:', {
        localTime: localTime.toString(),
        hours: localTime.getHours(),
        minutes: localTime.getMinutes()
    });
}

// Exit
console.log('Time parsing test completed');