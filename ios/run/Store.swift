import Foundation
import Observation
import Security
import WidgetKit

/// App-wide data: the run feed, rollups and the plan around today. Each tab
/// reads from here so switching tabs never refetches.
@Observable
final class Store {
    var activities: [Activity] = []
    var stats: StatsResponse?
    var records: [AllTimeRecord] = []
    var blocks: [TrainingBlock] = []
    var plans: [PlannedRun] = []

    var feedError: Error?
    var planError: Error?
    var summaryError: Error?
    var loadedFeed = false
    var loadedPlan = false
    var loadedSummary = false

    /// A run to push on the feed (`<source>/<externalId>`), from a widget tap.
    var openActivityID: String? = {
        #if DEBUG
        // `-open garmin/<id>` pushes that run, for screenshots.
        UserDefaults.standard.string(forKey: "open")
        #else
        nil
        #endif
    }()

    /// A planned run to push on the plan (its id), from a widget or accessory tap.
    var openPlanID: String? = {
        #if DEBUG
        // `-plan <id>` pushes that planned run, for screenshots.
        UserDefaults.standard.string(forKey: "plan")
        #else
        nil
        #endif
    }()

    var activeBlock: TrainingBlock? {
        blocks.first { $0.status == "active" } ?? blocks.first
    }

    /// The first still-planned run from today on.
    var nextRun: PlannedRun? {
        let today = Fmt.calendar.startOfDay(for: .now)
        return plans
            .filter { $0.status == "planned" && $0.day >= today }
            .min { $0.date < $1.date }
    }

    func loadFeed() async {
        do {
            activities = try await API.activities()
            feedError = nil
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            if !isCancellation(error) { feedError = error }
        }
        loadedFeed = true
    }

    func loadPlan() async {
        do {
            blocks = try await API.blocks()
            // The active block's whole span, else a window around today.
            let cal = Fmt.calendar
            let from = activeBlock?.startDate ?? ISODate.dayString(cal.date(byAdding: .day, value: -14, to: .now)!)
            let to = activeBlock?.endDate ?? ISODate.dayString(cal.date(byAdding: .day, value: 28, to: .now)!)
            plans = try await API.plans(from: from, to: to)
            planError = nil
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            if !isCancellation(error) { planError = error }
        }
        loadedPlan = true
    }

    func loadSummary() async {
        do {
            async let s = API.stats()
            async let r = API.records()
            (stats, records) = try await (s, r)
            summaryError = nil
        } catch {
            if !isCancellation(error) { summaryError = error }
        }
        loadedSummary = true
    }

    func activity(source: String, externalId: String) -> Activity? {
        activities.first { $0.source == source && $0.externalId == externalId }
    }

    // MARK: Write token

    var writeToken: String? = Keychain.read() {
        didSet {
            if let writeToken { Keychain.save(writeToken) } else { Keychain.delete() }
        }
    }

    private func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
}

/// The write password, kept in the Keychain rather than UserDefaults.
enum Keychain {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "run.rfoel.dev",
        kSecAttrAccount as String: "writeToken",
    ]

    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
