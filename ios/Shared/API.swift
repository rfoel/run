import Foundation

// Shapes mirror packages/web/src/lib/api.ts (which mirrors @run/core). Only the
// fields the app reads are decoded; everything optional the server may omit.

struct Activity: Codable, Identifiable, Hashable {
    let source: String
    let externalId: String
    let startDate: String
    let name: String
    let sportType: String
    let distance: Double
    let movingTime: Double
    let elapsedTime: Double
    let elevationGain: Double
    var avgHr: Double?
    var maxHr: Double?
    var avgCadence: Double?
    var polyline: String?
    /// The route simplified for thumbnails (precision 4).
    var thumb: String?
    var indoor: Bool?
    var bestEfforts: [StoredBest]?
    var splits: [Split]?

    var id: String { "\(source)/\(externalId)" }
    var date: Date { ISODate.parse(startDate) }
    var paceSecPerKm: Double? { distance > 0 ? movingTime / (distance / 1000) : nil }
}

struct StoredBest: Codable, Hashable {
    let m: Double
    let t: Double
    var hr: Double?
}

struct Split: Codable, Hashable {
    let km: Double
    let movingSec: Double
    var avgHr: Double?
    var elevationDelta: Double?
}

struct Stat: Codable, Hashable {
    let count: Int
    let distance: Double
    let movingTime: Double
    let elevationGain: Double
}

struct StatsResponse: Codable {
    var total: Stat?
    var year: Stat?
    var month: Stat?
    var week: Stat?
}

struct AllTimeRecord: Codable, Identifiable, Hashable {
    let meters: Double
    let label: String
    let timeSec: Double
    let paceSecPerKm: Double
    let source: String
    let externalId: String
    let startDate: String
    var activityName: String?

    var id: Double { meters }
}

struct ChartSeries: Codable {
    let km: [Double]
    let pace: [Double?]
    let hr: [Double?]
    var ele: [Double?]?
}

struct DeviceLap: Codable, Identifiable, Hashable {
    let index: Int
    var intensity: String?
    let distance: Double
    let duration: Double
    var paceSecPerKm: Double?
    var avgHr: Double?

    var id: Int { index }
}

struct ActivityExtras: Codable {
    struct Weather: Codable { var tempC: Double?; var humidity: Double?; var desc: String? }
    struct Physio: Codable { var aerobicTE: Double?; var anaerobicTE: Double?; var trainingLoad: Double?; var calories: Double? }
    var laps: [DeviceLap]?
    var weather: Weather?
    var physio: Physio?
}

struct WorkoutAnalysis: Codable {
    struct Insights: Codable {
        var pattern: String?
        var target_hit: Bool?
        var rpe_estimate: Double?
        var highlights: [String]?
        var issues: [String]?
        var next_workout_suggestion: String?
    }
    var title: String?
    let type: String
    var analysis: Insights?
}

struct StoredAnalysis: Codable {
    let analysis: WorkoutAnalysis
}

struct ActivityDetail: Codable {
    let activity: Activity
    let series: ChartSeries?
    let analysis: StoredAnalysis?
    let plan: PlannedRun?
    let extras: ActivityExtras?
}

struct PlanCompliance: Codable, Hashable {
    var volumePct: Double?
    var targetHit: Bool?
    var pattern: String?
    var rpe: Double?
}

struct PlannedRun: Codable, Identifiable, Hashable {
    let id: String
    let date: String
    let type: String
    var distance: Double?
    var durationSec: Double?
    var paceTargetSec: Double?
    var notes: String?
    var shortTitle: String?
    let status: String
    var blockId: String?
    var garminWorkoutId: Int?
    var workout: StructuredWorkout?
    var compliance: PlanCompliance?
    var actualSource: String?
    var actualExternalId: String?
    var actualDistance: Double?
    var actualMovingTime: Double?
    var actualAvgHr: Double?

    var day: Date { ISODate.day(date) }
    /// Planned distance, else what the structured workout adds up to.
    var plannedDistance: Double? { distance ?? workout?.distance }
}

struct BlockWeek: Codable, Hashable {
    let weekStart: String
    let phase: String
    var targetKm: Double?
    var focus: String?
}

struct TrainingBlock: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var goal: String?
    var raceDate: String?
    let startDate: String
    let endDate: String
    let weeks: [BlockWeek]
    let status: String
}

struct SyncResult: Codable {
    let fetched: Int
    let imported: Int
    let skipped: Int
    let linked: Int
    let errors: [String]
}

private struct Items<T: Codable>: Codable { let items: [T] }

enum APIError: LocalizedError {
    case status(Int, String)
    var errorDescription: String? {
        switch self {
        case .status(let code, let what): "\(what) falhou (\(code))"
        }
    }
}

enum API {
    static let base = URL(string: "https://run.rfoel.dev/api")!

    private static let decoder = JSONDecoder()

    private static func url(_ path: String, _ query: [String: String]) -> URL {
        var comps = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0, value: $1) } }
        return comps.url!
    }

    private static func get<T: Decodable>(_ path: String, _ query: [String: String] = [:], as: T.Type) async throws -> T {
        let (data, res) = try await URLSession.shared.data(from: url(path, query))
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw APIError.status(code, path) }
        return try decoder.decode(T.self, from: data)
    }

    private static func post(_ path: String, _ query: [String: String] = [:], token: String) async throws -> Data {
        var req = URLRequest(url: url(path, query))
        req.httpMethod = "POST"
        req.setValue(token, forHTTPHeaderField: "x-write-token")
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else { throw APIError.status(code, path) }
        return data
    }

    static func activities(limit: Int = 1000) async throws -> [Activity] {
        try await get("activities", ["limit": String(limit)], as: Items<Activity>.self).items
    }

    static func activity(source: String, externalId: String) async throws -> ActivityDetail {
        try await get("activities/\(source)/\(externalId)", as: ActivityDetail.self)
    }

    /// Just a run's full-precision route, without decoding its chart series.
    static func route(source: String, externalId: String) async throws -> String? {
        struct Detail: Decodable {
            struct Route: Decodable { let polyline: String? }
            let activity: Route
        }
        return try await get("activities/\(source)/\(externalId)", as: Detail.self).activity.polyline
    }

    static func stats() async throws -> StatsResponse {
        try await get("stats", as: StatsResponse.self)
    }

    static func records() async throws -> [AllTimeRecord] {
        try await get("records", as: Items<AllTimeRecord>.self).items
    }

    static func plans(from: String, to: String) async throws -> [PlannedRun] {
        try await get("plans", ["from": from, "to": to], as: Items<PlannedRun>.self).items
    }

    static func blocks() async throws -> [TrainingBlock] {
        try await get("blocks", as: Items<TrainingBlock>.self).items
    }

    static func verify(token: String) async -> Bool {
        (try? await post("auth/verify", token: token)) != nil
    }

    static func syncGarmin(token: String, days: Int = 7) async throws -> SyncResult {
        try decoder.decode(SyncResult.self, from: try await post("garmin/sync", ["days": String(days)], token: token))
    }
}
