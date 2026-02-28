const fs = require("fs");

// Helper function to convert time string to seconds
function parseTimeToSeconds(timeStr) {
    const parts = timeStr.toLowerCase().trim();
    let timePart = parts.replace("am", "").replace("pm", "").trim();
    let [h, m, s] = timePart.split(":").map(Number);

    const isPm = parts.includes("pm");
    const isAm = parts.includes("am");

    if (isPm && h !== 12) {
        h += 12;
    }

    if (isAm && h === 12) {
        h = 0;
    }

    return h * 3600 + m * 60 + s;
}

// Helper function to convert seconds back to h:mm:ss
function secondsToTimeFormat(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const mStr = m.toString().padStart(2, "0");
    const sStr = s.toString().padStart(2, "0");

    return `${h}:${mStr}:${sStr}`;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = parseTimeToSeconds(startTime)
    const endSec = parseTimeToSeconds(endTime)
    let diff = endSec - startSec
    if (diff < 0) {
        diff += 24 * 3600
    }
    return secondsToTimeFormat(diff)
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = parseTimeToSeconds(startTime)
    let endSec = parseTimeToSeconds(endTime)
    if (endSec <= startSec) {
        endSec += 24 * 3600
    }
    const deliveryStart = 8 * 3600
    const deliveryEnd = 22 * 3600
    const daySeconds = 24 * 3600
    let activeSeconds = 0
    const windows = [
        { start: deliveryStart, end: deliveryEnd },
        { start: deliveryStart + daySeconds, end: deliveryEnd + daySeconds }
    ]
    for (let i = 0; i < windows.length; i++) {
        const overlapStart = Math.max(startSec, windows[i].start);
        const overlapEnd = Math.min(endSec, windows[i].end);
        if (overlapEnd > overlapStart) {
            activeSeconds += overlapEnd - overlapStart
        }
    }
    const totalDuration = endSec - startSec
    const idleSeconds = totalDuration - activeSeconds
    return secondsToTimeFormat(idleSeconds)
}
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const durSec = parseTimeToSeconds(shiftDuration)
    const idleSec = parseTimeToSeconds(idleTime)
    const activeSec = durSec - idleSec
    return secondsToTimeFormat(activeSec)
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = parseTimeToSeconds(activeTime)
    const quotaNormal = 8 * 3600 + 24 * 60
    const quotaEid = 6 * 3600
    const dateObj = new Date(date)
    const year = dateObj.getFullYear()
    const month = dateObj.getMonth() + 1
    const day = dateObj.getDate()
    let quota = quotaNormal
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        quota = quotaEid
    }
    return activeSec >= quota
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let content = ''
    if (fs.existsSync(textFile)) {
        content = fs.readFileSync(textFile, 'utf8')
    }
    const lines = content.split('\n').filter(line => line.trim() !== '')
    const { driverID, driverName, date, startTime, endTime } = shiftObj
    const exists = lines.some(line => {
        const cols = line.split(',')
        return cols[0].trim() === driverID && cols[2].trim() === date
    })
    if (exists) {
        return {}
    }
    const shiftDuration = getShiftDuration(startTime, endTime)
    const idleTime = getIdleTime(startTime, endTime)
    const activeTime = getActiveTime(shiftDuration, idleTime)
    const metQuotaVal = metQuota(date, activeTime)
    const hasBonus = false
    const newRecord = {
        driverID,
        driverName,
        date,
        startTime,
        endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: metQuotaVal,
        hasBonus
}
    const recordStr = `${newRecord.driverID},${newRecord.driverName},${newRecord.date},${newRecord.startTime},${newRecord.endTime},${newRecord.shiftDuration},${newRecord.idleTime},${newRecord.activeTime},${newRecord.metQuota},${newRecord.hasBonus}`
    let insertIndex = -1
    lines.forEach((line, index) => {
        const cols = line.split(',')
        if (cols[0].trim() === driverID) {
            insertIndex = index
        }
    })
    if (insertIndex === -1) {
        lines.push(recordStr)
    } else {
        lines.splice(insertIndex + 1, 0, recordStr)
    }
    fs.writeFileSync(textFile, lines.join('\n'))
    return newRecord
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, 'utf8')
    const lines = content.split('\n')
    const updatedLines = lines.map(line => {
        if (line.trim() === '') return line
        const cols = line.split(',')
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = newValue.toString()
            return cols.join(',')
        }
        return line
    })
    fs.writeFileSync(textFile, updatedLines.join('\n'))
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8')
    const lines = content.split('\n').filter(line => line.trim() !== '')
    let exists = false
    let count = 0
    const monthStr = month.toString().padStart(2, '0')
    lines.forEach(line => {
        const cols = line.split(',')
        if (cols[0].trim() === driverID) {
            exists = true
            const dateParts = cols[2].trim().split('-')
            const recordMonth = dateParts[1]
            if (recordMonth === monthStr || parseInt(recordMonth) === parseInt(month)) {
                if (cols[9].trim() === 'true') {
                    count++
                }
            }
        }
    })
    if (!exists) {
        return -1
    }
    return count
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8')
    const lines = content.split('\n').filter(line => line.trim() !== '')
    let totalSeconds = 0
    const monthStr = month.toString().padStart(2, '0')
    lines.forEach(line => {
        const cols = line.split(',')
        if (cols[0].trim() === driverID) {
            const dateParts = cols[2].trim().split('-')
            const recordMonth = dateParts[1]
            if (recordMonth === monthStr || parseInt(recordMonth) === parseInt(month)) {
                totalSeconds += parseTimeToSeconds(cols[7].trim())
            }
        }
    })
    return secondsToTimeFormat(totalSeconds)
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rateContent = fs.readFileSync(rateFile, 'utf8')
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '')
    let dayOff = ''
    rateLines.forEach(line => {
        const cols = line.split(',')
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim()
        }
    })
    const daysInMonth = new Date(2025, month, 0).getDate()
    const dayMap = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
    }
    const offDayIndex = dayMap[dayOff]
    let totalRequiredSeconds = 0
    const quotaNormal = 8 * 3600 + 24 * 60
    const quotaEid = 6 * 3600
    for (let d = 1; d <= daysInMonth; d++) {
        const currentDayOfWeek = new Date(2025, month - 1, d).getDay()
        if (currentDayOfWeek === offDayIndex) {
            continue
        }
        let dailyQuota = quotaNormal
        if (month === 4 && d >= 10 && d <= 30) {
            dailyQuota = quotaEid
        }
        totalRequiredSeconds += dailyQuota
}
    const bonusDeductionSeconds = bonusCount * 2 * 3600
    totalRequiredSeconds -= bonusDeductionSeconds
    if (totalRequiredSeconds < 0) {
        totalRequiredSeconds = 0
    }
    return secondsToTimeFormat(totalRequiredSeconds)
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateContent = fs.readFileSync(rateFile, 'utf8')
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '')
    let basePay = 0
    let tier = 1
    rateLines.forEach(line => {
        const cols = line.split(',')
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim())
            tier = parseInt(cols[3].trim())
        }
    })
    const actualSec = parseTimeToSeconds(actualHours)
    const requiredSec = parseTimeToSeconds(requiredHours)
    if (actualSec >= requiredSec) {
        return basePay
    }
    const missingSec = requiredSec - actualSec
    let allowanceHours = 0
    if (tier === 1) allowanceHours = 50
    else if (tier === 2) allowanceHours = 20
    else if (tier === 3) allowanceHours = 10
    else if (tier === 4) allowanceHours = 3
    const allowanceSec = allowanceHours * 3600
    let billableMissingSec = missingSec - allowanceSec
    if (billableMissingSec < 0) {
        billableMissingSec = 0
    }
    const billableMissingHours = Math.floor(billableMissingSec / 3600)
    const deductionRatePerHour = Math.floor(basePay / 185)
    const salaryDeduction = billableMissingHours * deductionRatePerHour
    const netPay = basePay - salaryDeduction
    return netPay
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
