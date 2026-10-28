import Foundation

// Mirrors @run/core/workoutTypes and the text views in @run/core/workoutText.

struct WorkoutDuration: Codable, Hashable {
    let kind: String // "time" | "distance" | "lap"
    var seconds: Double?
    var meters: Double?
}

struct WorkoutStep: Codable, Hashable {
    var kind: String?
    var duration: WorkoutDuration?
    var paceTargetSec: Double?
    var paceFastSec: Double?
    var paceSlowSec: Double?
    var hrZone: Int?
    var hrLowBpm: Int?
    var hrHighBpm: Int?
}

struct WorkoutElement: Codable, Hashable {
    var kind: String?
    var duration: WorkoutDuration?
    var paceTargetSec: Double?
    var paceFastSec: Double?
    var paceSlowSec: Double?
    var hrZone: Int?
    var hrLowBpm: Int?
    var hrHighBpm: Int?
    var `repeat`: Int?
    var steps: [WorkoutStep]?

    var asStep: WorkoutStep {
        WorkoutStep(kind: kind, duration: duration, paceTargetSec: paceTargetSec, paceFastSec: paceFastSec,
                    paceSlowSec: paceSlowSec, hrZone: hrZone, hrLowBpm: hrLowBpm, hrHighBpm: hrHighBpm)
    }
}

struct StructuredWorkout: Codable, Hashable {
    var name: String?
    var description: String?
    let elements: [WorkoutElement]

    /// One line per element, e.g. ["Aquec. 2 km", "6× (1000 m @ 4:30–4:45/km + 90 s trote)", "Desaq. 1 km"].
    var lines: [String] {
        elements.compactMap { el in
            if let reps = el.repeat, let steps = el.steps, !steps.isEmpty {
                let inner = steps.map(Self.stepText).joined(separator: " + ")
                return steps.count > 1 ? "\(reps)× (\(inner))" : "\(reps)× \(inner)"
            }
            return el.kind != nil && el.duration != nil ? Self.stepText(el.asStep) : nil
        }
    }

    /// Total metres when every step is distance-based, else nil.
    var distance: Double? {
        var total = 0.0
        for el in elements {
            let isRepeat = el.repeat != nil && !(el.steps ?? []).isEmpty
            let steps = isRepeat ? el.steps! : (el.kind != nil && el.duration != nil ? [el.asStep] : [])
            let times = isRepeat ? el.repeat! : 1
            for (i, s) in steps.enumerated() {
                guard s.duration?.kind == "distance", let m = s.duration?.meters else { return nil }
                // The trailing recovery after the last rep is skipped on the watch.
                let trailingRest = isRepeat && (s.kind == "recovery" || s.kind == "rest") && i == steps.count - 1
                total += m * Double(trailingRest ? times - 1 : times)
            }
        }
        return total > 0 ? total : nil
    }

    static func durationText(_ d: WorkoutDuration?) -> String {
        guard let d else { return "" }
        switch d.kind {
        case "distance":
            let m = d.meters ?? 0
            return m >= 1000 && m.truncatingRemainder(dividingBy: 100) == 0
                ? "\((m / 1000).formatted(.number.locale(Fmt.locale))) km"
                : "\(Int(m)) m"
        case "time":
            let s = Int(d.seconds ?? 0)
            if s >= 60 && s % 60 == 0 { return "\(s / 60) min" }
            return s > 60 ? "\(s / 60)min\(String(format: "%02d", s % 60))" : "\(s) s"
        default:
            return "até apertar lap"
        }
    }

    /// The step's pace or heart-rate target, e.g. "4:30–4:45/km", else nil.
    static func targetText(_ s: WorkoutStep) -> String? {
        if let f = s.paceFastSec, let sl = s.paceSlowSec {
            return "\(Fmt.pace(min(f, sl)))–\(Fmt.pace(max(f, sl)))/km"
        }
        if let p = s.paceTargetSec { return "\(Fmt.pace(p))/km" }
        if let lo = s.hrLowBpm, let hi = s.hrHighBpm { return "\(lo)–\(hi) bpm" }
        if let z = s.hrZone { return "Z\(z)" }
        return nil
    }

    private static func stepText(_ s: WorkoutStep) -> String {
        let base = durationText(s.duration) + (targetText(s).map { " @ \($0)" } ?? "")
        switch s.kind {
        case "warmup": return "Aquec. \(base)"
        case "cooldown": return "Desaq. \(base)"
        case "recovery": return "\(base) trote"
        case "rest": return "\(base) parado"
        default: return base
        }
    }
}
