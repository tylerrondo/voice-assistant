/**
 * Validation Bench
 *
 * Reads environment information needed for the Validation Report.
 * Isolated here so that ReportBuilder doesn't depend on deprecated
 * or browser-specific navigator APIs directly. navigator.platform
 * is deprecated in modern browsers; operating system is instead
 * derived from navigator.userAgent.
 */

export interface EnvironmentInfo {
    readonly browser: string
    readonly operatingSystem: string
}

export function getEnvironmentInfo(): EnvironmentInfo {

    const userAgent = navigator.userAgent

    return {
        browser: userAgent,
        operatingSystem: detectOperatingSystem(userAgent)
    }

}

function detectOperatingSystem(userAgent: string): string {

    if (userAgent.includes("Windows")) return "Windows"
    if (userAgent.includes("Mac OS")) return "macOS"
    if (userAgent.includes("Android")) return "Android"
    if (userAgent.includes("iPhone") || userAgent.includes("iPad")) return "iOS"
    if (userAgent.includes("Linux")) return "Linux"

    return "Unknown"

}