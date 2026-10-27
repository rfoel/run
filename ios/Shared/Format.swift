import Foundation

enum ISODate {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ s: String) -> Date {
        fractional.date(from: s) ?? plain.date(from: s) ?? .distantPast
    }

    /// A local calendar day "YYYY-MM-DD", at local midnight.
    static func day(_ s: String) -> Date { dayFormatter.date(from: s) ?? .distantPast }

    /// Local-timezone "YYYY-MM-DD".
    static func dayString(_ d: Date) -> String { dayFormatter.string(from: d) }
}

enum Fmt {
    static let locale = Locale(identifier: "pt_BR")

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.locale = locale
        c.firstWeekday = 2 // weeks run Monday–Sunday, like the server's
        return c
    }

    /// 6413 -> "6,41"
    static func km(_ meters: Double, digits: Int = 2) -> String {
        (meters / 1000).formatted(.number.precision(.fractionLength(digits)).locale(locale))
    }

    /// 265 -> "4:25"
    static func pace(_ secPerKm: Double?) -> String {
        guard let s = secPerKm, s.isFinite, s > 0 else { return "--" }
        let total = Int(s.rounded())
        return "\(total / 60):\(String(format: "%02d", total % 60))"
    }

    /// 2479 -> "41:19", 5201 -> "1h26"
    static func duration(_ sec: Double) -> String {
        let t = Int(sec.rounded())
        let h = t / 3600, m = (t % 3600) / 60, s = t % 60
        if h > 0 { return "\(h)h\(String(format: "%02d", m))" }
        return "\(m):\(String(format: "%02d", s))"
    }

    /// Race-style clock: 1182 -> "19:42", 3725 -> "1:02:05"
    static func clock(_ sec: Double) -> String {
        let t = Int(sec.rounded())
        let h = t / 3600, m = (t % 3600) / 60, s = t % 60
        if h > 0 { return "\(h):\(String(format: "%02d", m)):\(String(format: "%02d", s))" }
        return "\(m):\(String(format: "%02d", s))"
    }

    /// Total hours for big rollups: 1051915 -> "292h"
    static func hours(_ sec: Double) -> String { "\(Int(sec / 3600))h" }

    /// "Hoje · 07:12", "Ontem · 18:40", else "seg., 12 de out. de 2026 · 07:30".
    static func runWhen(_ d: Date) -> String {
        let time = d.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(locale))
        let cal = calendar
        let day: String
        if cal.isDateInToday(d) {
            day = "Hoje"
        } else if cal.isDateInYesterday(d) {
            day = "Ontem"
        } else {
            day = d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year().locale(locale))
        }
        return "\(day) · \(time)"
    }

    /// "outubro de 2026"
    static func month(_ d: Date) -> String {
        d.formatted(.dateTime.month(.wide).year().locale(locale))
    }

    /// "26 out. – 1 nov."
    static func weekRange(_ monday: Date) -> String {
        let sunday = calendar.date(byAdding: .day, value: 6, to: monday)!
        let style = Date.FormatStyle.dateTime.day().month(.abbreviated).locale(locale)
        return "\(monday.formatted(style)) – \(sunday.formatted(style))"
    }

    /// "ter., 27 out."
    static func shortDay(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(locale))
    }
}

/// Planned run and analysis types, in the web's pt-BR labels.
enum Labels {
    static func runType(_ t: String) -> String {
        switch t {
        case "easy": "Leve"
        case "long": "Longão"
        case "tempo": "Limiar"
        case "interval": "Intervalado"
        case "race": "Prova"
        case "recovery", "regen": "Regenerativo"
        case "fartlek": "Fartlek"
        default: t.capitalized
        }
    }

    static func phase(_ p: String) -> String {
        switch p {
        case "base": "Base"
        case "build": "Construção"
        case "peak": "Pico"
        case "taper": "Polimento"
        case "race": "Prova"
        case "recovery": "Recuperação"
        default: p.capitalized
        }
    }

    static func status(_ s: String) -> String {
        switch s {
        case "done": "Feito"
        case "partial": "Parcial"
        case "skipped": "Pulado"
        default: "Planejado"
        }
    }
}
