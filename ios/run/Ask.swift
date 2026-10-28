import Foundation
import FoundationModels

// Natural-language questions over the run history. The on-device model only
// turns the question into a `RunQuery` (what to measure); the period is read
// from the question here, where it's predictable, and the numbers are computed
// from the feed already in the Store, so they are exact.

@Generable
struct RunQuery {
    @Generable
    enum Goal {
        case record, total, average, count, bestEffort, list
    }

    @Generable
    enum Record {
        case fastest, slowest, longest, shortest, longestTime, mostElevation, highestHeartRate
    }

    @Generable
    enum Metric {
        case distance, time, pace, elevation, heartRate
    }

    @Guide(description: "record: uma única corrida extrema (mais rápida, mais longa…). total: soma no período (km, tempo, elevação). average: média no período (pace, distância, FC). count: quantas corridas. bestEffort: melhor tempo numa distância fixa (1 km, 5 km, 10 km, meia, maratona). list: listar as corridas que batem com o filtro.")
    var goal: Goal

    @Guide(description: "Só para goal record. fastest = menor pace, slowest = maior pace, longest = maior distância, shortest = menor distância, longestTime = maior duração, mostElevation = mais subida, highestHeartRate = maior FC média.")
    var record: Record

    @Guide(description: "Só para goal total ou average: distance, time, pace, elevation ou heartRate.")
    var metric: Metric

    @Guide(description: "Distância em km para goal bestEffort: 1, 5, 10, 15, 21.1 (meia) ou 42.2 (maratona). Nulo nos outros.")
    var effortKm: Double?

    @Guide(description: "Distância mínima em km quando a pergunta filtra por distância ('acima de 15 km'), senão nulo.")
    var minKm: Double?

    @Guide(description: "Distância máxima em km quando a pergunta filtra por distância ('até 5 km'), senão nulo.")
    var maxKm: Double?

    @Guide(description: "Palavra que deve aparecer no nome da corrida quando a pergunta cita um tipo de treino pelo nome (ex. 'limiar', 'longo', 'prova'), senão nulo.")
    var nameContains: String?
}

struct AskAnswer {
    struct Item: Identifiable {
        let activity: Activity
        /// What this run contributes, e.g. "19:42" for a 5 km effort.
        var note: String?
        var id: String { activity.id }
    }

    let headline: String
    var unit: String?
    let caption: String
    let itemsTitle: String
    let items: [Item]
}

enum Ask {
    static var isAvailable: Bool { SystemLanguageModel.default.isAvailable }

    private static let instructions = """
    Você converte perguntas em português sobre o histórico de corridas de um atleta \
    num RunQuery. Não responda a pergunta, só preencha os campos. Ignore datas e \
    períodos: eles são tratados à parte.

    Exemplos:
    - "qual foi minha corrida mais rápida?" → goal record, record fastest
    - "minha corrida mais longa esse ano" → goal record, record longest
    - "qual foi meu pace no último mês" → goal average, metric pace
    - "quantos km corri em 2024" → goal total, metric distance
    - "quanto tempo corri em março" → goal total, metric time
    - "quantas corridas fiz semana passada" → goal count
    - "meu melhor 5k" → goal bestEffort, effortKm 5
    - "melhor 10 km em 2025" → goal bestEffort, effortKm 10
    - "melhor meia maratona" → goal bestEffort, effortKm 21.1
    - "corridas de limiar em março" → goal list, nameContains limiar
    - "corridas acima de 15 km" → goal list, minKm 15
    - "FC média este mês" → goal average, metric heartRate
    """

    /// Warms the model up while the user types, so the first answer is quicker.
    static func prewarm() {
        guard isAvailable else { return }
        LanguageModelSession(instructions: instructions).prewarm()
    }

    static func interpret(_ question: String) async throws -> RunQuery {
        let session = LanguageModelSession(instructions: instructions)
        var q = try await session.respond(
            to: question,
            generating: RunQuery.self,
            options: GenerationOptions(samplingMode: .greedy)
        ).content
        // Guard against filled-in fields the question never asked for.
        let text = normalized(question)
        let words = Set(words(text))
        if let name = q.nameContains.map(normalized),
           !text.contains(name) || months.contains(name) || name.contains(where: \.isNumber) {
            q.nameContains = nil
        }
        let atLeast = ["acima de", "mais de", "pelo menos", "maior que", "maiores que", "a partir de"]
        let atMost = ["abaixo de", "menos de", "ate ", "menor que", "menores que"]
        if !atLeast.contains(where: text.contains) || (q.minKm ?? 0) <= 0 { q.minKm = nil }
        if !atMost.contains(where: text.contains) || (q.maxKm ?? 0) <= 0 { q.maxKm = nil }
        if q.effortKm != nil && q.goal == .record { q.goal = .bestEffort }
        // An effort needs a distance in the question; "mais rápida" alone is a pace record.
        if q.goal == .bestEffort && !text.contains(where: \.isNumber) && words.isDisjoint(with: ["meia", "maratona", "milha"]) {
            q.goal = .record
            q.record = .fastest
        }
        if q.goal == .bestEffort {
            // The distance is the effort itself, not a filter.
            q.nameContains = nil; q.minKm = nil; q.maxKm = nil
        } else {
            q.effortKm = nil
        }
        if (q.goal == .total || q.goal == .average) && (text.contains("quanto tempo") || text.contains("horas")) {
            q.metric = .time
        }
        return q
    }

    // MARK: Evaluation

    static func answer(_ q: RunQuery, question: String, runs all: [Activity], now: Date = .now) -> AskAnswer {
        let (range, periodLabel) = interval(period(question, now: now), now: now, oldest: all.map(\.date).min())
        var runs = all.filter { range?.contains($0.date) ?? true }
        if let min = q.minKm { runs = runs.filter { $0.distance >= min * 1000 } }
        if let max = q.maxKm { runs = runs.filter { $0.distance <= max * 1000 } }
        if let name = q.nameContains?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
            runs = runs.filter { $0.name.localizedStandardContains(name) }
        }
        runs.sort { $0.date > $1.date }

        var scope = periodLabel
        if let name = q.nameContains, !name.isEmpty { scope += " · \"\(name)\"" }
        if let min = q.minKm { scope += " · acima de \(trimmed(min)) km" }
        if let max = q.maxKm { scope += " · até \(trimmed(max)) km" }

        guard !runs.isEmpty else {
            return AskAnswer(headline: "0", unit: "corridas", caption: scope, itemsTitle: "", items: [])
        }

        switch q.goal {
        case .record: return record(q.record, runs: runs, scope: scope)
        case .total: return total(q.metric, runs: runs, scope: scope)
        case .average: return average(q.metric, runs: runs, scope: scope)
        case .count:
            return AskAnswer(headline: "\(runs.count)", unit: runs.count == 1 ? "corrida" : "corridas",
                             caption: scope, itemsTitle: "Corridas", items: runs.map { .init(activity: $0) })
        case .bestEffort: return bestEffort(km: q.effortKm ?? 5, runs: runs, scope: scope)
        case .list:
            return AskAnswer(headline: "\(runs.count)", unit: runs.count == 1 ? "corrida" : "corridas",
                             caption: scope, itemsTitle: "Corridas", items: runs.map { .init(activity: $0) })
        }
    }

    private static func record(_ r: RunQuery.Record, runs: [Activity], scope: String) -> AskAnswer {
        // Pace records skip sub-1 km jogs, whose pace says little.
        let paced = runs.filter { $0.distance >= 1000 && $0.paceSecPerKm != nil }
        let sorted: [Activity]
        let value: (Activity) -> (String, String?)
        let label: String
        switch r {
        case .fastest:
            sorted = paced.sorted { $0.paceSecPerKm! < $1.paceSecPerKm! }
            value = { (Fmt.pace($0.paceSecPerKm), "/km") }; label = "Mais rápida"
        case .slowest:
            sorted = paced.sorted { $0.paceSecPerKm! > $1.paceSecPerKm! }
            value = { (Fmt.pace($0.paceSecPerKm), "/km") }; label = "Mais lenta"
        case .longest:
            sorted = runs.sorted { $0.distance > $1.distance }
            value = { (Fmt.km($0.distance), "km") }; label = "Mais longa"
        case .shortest:
            sorted = runs.sorted { $0.distance < $1.distance }
            value = { (Fmt.km($0.distance), "km") }; label = "Mais curta"
        case .longestTime:
            sorted = runs.sorted { $0.movingTime > $1.movingTime }
            value = { (Fmt.clock($0.movingTime), nil) }; label = "Mais demorada"
        case .mostElevation:
            sorted = runs.sorted { $0.elevationGain > $1.elevationGain }
            value = { ("\(Int($0.elevationGain))", "m") }; label = "Mais subida"
        case .highestHeartRate:
            sorted = runs.filter { $0.avgHr != nil }.sorted { $0.avgHr! > $1.avgHr! }
            value = { ($0.avgHr.map { "\(Int($0))" } ?? "--", "bpm") }; label = "Maior FC média"
        }
        guard let top = sorted.first else {
            return AskAnswer(headline: "--", caption: scope, itemsTitle: "", items: [])
        }
        let (v, unit) = value(top)
        return AskAnswer(
            headline: v, unit: unit,
            caption: "\(label) · \(top.name) · \(Fmt.shortDay(top.date)) \(year(top.date)) · \(scope)",
            itemsTitle: "Top 10",
            items: sorted.prefix(10).map { a in
                let (v, u) = value(a)
                return .init(activity: a, note: [v, u].compactMap { $0 }.joined(separator: " "))
            }
        )
    }

    private static func total(_ m: RunQuery.Metric, runs: [Activity], scope: String) -> AskAnswer {
        let n = "\(runs.count) \(runs.count == 1 ? "corrida" : "corridas") · \(scope)"
        let items = runs.map { AskAnswer.Item(activity: $0) }
        switch m {
        case .pace, .heartRate:
            return average(m, runs: runs, scope: scope)
        case .distance:
            let km = runs.map(\.distance).reduce(0, +)
            return AskAnswer(headline: Fmt.km(km, digits: km >= 100_000 ? 0 : 1), unit: "km",
                             caption: "Total · \(n)", itemsTitle: "Corridas", items: items)
        case .time:
            let s = runs.map(\.movingTime).reduce(0, +)
            return AskAnswer(headline: s >= 36_000 ? Fmt.hours(s) : Fmt.duration(s), caption: "Tempo total · \(n)",
                             itemsTitle: "Corridas", items: items)
        case .elevation:
            let e = runs.map(\.elevationGain).reduce(0, +)
            return AskAnswer(headline: Int(e).formatted(.number.locale(Fmt.locale)), unit: "m",
                             caption: "Subida total · \(n)", itemsTitle: "Corridas", items: items)
        }
    }

    private static func average(_ m: RunQuery.Metric, runs: [Activity], scope: String) -> AskAnswer {
        let n = "\(runs.count) \(runs.count == 1 ? "corrida" : "corridas") · \(scope)"
        let items = runs.map { AskAnswer.Item(activity: $0) }
        let count = Double(runs.count)
        switch m {
        case .pace:
            // Weighted by distance: total time over total km.
            let d = runs.map(\.distance).reduce(0, +), t = runs.map(\.movingTime).reduce(0, +)
            return AskAnswer(headline: Fmt.pace(d > 0 ? t / (d / 1000) : nil), unit: "/km",
                             caption: "Pace médio · \(n)", itemsTitle: "Corridas", items: items)
        case .distance:
            return AskAnswer(headline: Fmt.km(runs.map(\.distance).reduce(0, +) / count, digits: 1), unit: "km",
                             caption: "Distância média · \(n)", itemsTitle: "Corridas", items: items)
        case .time:
            return AskAnswer(headline: Fmt.duration(runs.map(\.movingTime).reduce(0, +) / count),
                             caption: "Tempo médio · \(n)", itemsTitle: "Corridas", items: items)
        case .elevation:
            return AskAnswer(headline: "\(Int(runs.map(\.elevationGain).reduce(0, +) / count))", unit: "m",
                             caption: "Subida média · \(n)", itemsTitle: "Corridas", items: items)
        case .heartRate:
            // Weighted by time, over the runs that recorded heart rate.
            let hr = runs.filter { $0.avgHr != nil }
            let t = hr.map(\.movingTime).reduce(0, +)
            let avg = t > 0 ? hr.map { $0.avgHr! * $0.movingTime }.reduce(0, +) / t : nil
            return AskAnswer(headline: avg.map { "\(Int($0.rounded()))" } ?? "--", unit: "bpm",
                             caption: "FC média · \(n)", itemsTitle: "Corridas", items: items)
        }
    }

    /// The stored best-effort distances, in metres (see @run/core/bestEfforts).
    private static let effortDistances: [Double] = [400, 805, 1000, 1609, 3219, 5000, 10000, 15000, 16093, 21097, 42195]

    private static func bestEffort(km: Double, runs: [Activity], scope: String) -> AskAnswer {
        let target = effortDistances.min { abs($0 - km * 1000) < abs($1 - km * 1000) }!
        let label = target >= 1000 && target.truncatingRemainder(dividingBy: 1000) == 0
            ? "\(Int(target / 1000)) km"
            : target == 21097 ? "Meia maratona" : target == 42195 ? "Maratona" : "\(Fmt.km(target, digits: 1)) km"
        let efforts = runs
            .compactMap { a in a.bestEfforts?.first { $0.m == target }.map { (a, $0.t) } }
            .sorted { $0.1 < $1.1 }
        guard let (top, t) = efforts.first else {
            return AskAnswer(headline: "--", caption: "Nenhum \(label) registrado · \(scope)", itemsTitle: "", items: [])
        }
        return AskAnswer(
            headline: Fmt.clock(t),
            caption: "Melhor \(label) · \(Fmt.pace(t / (target / 1000)))/km · \(top.name) · \(Fmt.shortDay(top.date)) \(year(top.date)) · \(scope)",
            itemsTitle: "Top 10",
            items: efforts.prefix(10).map { .init(activity: $0.0, note: Fmt.clock($0.1)) }
        )
    }

    // MARK: Periods

    enum Period: Equatable {
        case allTime, thisWeek, lastWeek, last7Days, thisMonth, lastMonth, last30Days,
             thisYear, lastYear, last12Months
        case year(Int)
        case month(year: Int, month: Int)
    }

    private static let months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
                                 "agosto", "setembro", "outubro", "novembro", "dezembro"]

    /// The period a question names, read from its words; all time when it names none.
    static func period(_ question: String, now: Date = .now) -> Period {
        let text = normalized(question)
        let cal = Fmt.calendar
        let year = text.firstMatch(of: #/\b(19|20)\d{2}\b/#).map { Int(text[$0.range])! }
        let words = Set(words(text))
        if let i = months.firstIndex(where: words.contains) {
            let month = i + 1
            // A bare month is its latest occurrence: "outubro" in March means last October.
            let thisYear = cal.component(.year, from: now), thisMonth = cal.component(.month, from: now)
            return .month(year: year ?? (month > thisMonth ? thisYear - 1 : thisYear), month: month)
        }
        if let year { return .year(year) }
        let phrases: [(String, Period)] = [
            ("semana passada", .lastWeek), ("esta semana", .thisWeek), ("essa semana", .thisWeek),
            ("ultimos 7 dias", .last7Days), ("ultima semana", .last7Days),
            ("mes passado", .lastMonth), ("este mes", .thisMonth), ("esse mes", .thisMonth),
            ("ultimo mes", .last30Days), ("ultimos 30 dias", .last30Days),
            ("ano passado", .lastYear), ("este ano", .thisYear), ("esse ano", .thisYear),
            ("ultimos 12 meses", .last12Months), ("ultimo ano", .last12Months),
        ]
        return phrases.first { text.contains($0.0) }?.1 ?? .allTime
    }

    /// The period's date range (nil = all time) and how to name it.
    private static func interval(_ p: Period, now: Date, oldest: Date?) -> (Range<Date>?, String) {
        let cal = Fmt.calendar
        func span(_ c: Calendar.Component, of d: Date) -> Range<Date> {
            let i = cal.dateInterval(of: c, for: d)!
            return i.start..<i.end
        }
        let thisYear = cal.component(.year, from: now)
        switch p {
        case .allTime:
            return (nil, oldest.map { "desde \(cal.component(.year, from: $0))" } ?? "sempre")
        case .thisWeek:
            return (span(.weekOfYear, of: now), "esta semana")
        case .lastWeek:
            return (span(.weekOfYear, of: cal.date(byAdding: .weekOfYear, value: -1, to: now)!), "semana passada")
        case .last7Days:
            return (cal.date(byAdding: .day, value: -7, to: now)!..<now, "últimos 7 dias")
        case .thisMonth:
            return (span(.month, of: now), Fmt.month(now))
        case .lastMonth:
            let d = cal.date(byAdding: .month, value: -1, to: now)!
            return (span(.month, of: d), Fmt.month(d))
        case .last30Days:
            return (cal.date(byAdding: .day, value: -30, to: now)!..<now, "últimos 30 dias")
        case .thisYear:
            return (span(.year, of: now), "\(thisYear)")
        case .lastYear:
            return (span(.year, of: cal.date(byAdding: .year, value: -1, to: now)!), "\(thisYear - 1)")
        case .last12Months:
            return (cal.date(byAdding: .month, value: -12, to: now)!..<now, "últimos 12 meses")
        case .year(let y):
            return (span(.year, of: cal.date(from: DateComponents(year: y, month: 6))!), "\(y)")
        case .month(let y, let m):
            let d = cal.date(from: DateComponents(year: y, month: m, day: 15))!
            return (span(.month, of: d), Fmt.month(d))
        }
    }

    private static func words(_ text: String) -> [String] {
        text.split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }

    /// Lowercased, without accents: "Março" → "marco".
    private static func normalized(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Fmt.locale).lowercased()
    }

    private static func year(_ d: Date) -> String { "\(Fmt.calendar.component(.year, from: d))" }

    private static func trimmed(_ km: Double) -> String { km.formatted(.number.locale(Fmt.locale)) }
}
