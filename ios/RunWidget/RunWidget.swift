import SwiftUI
import WidgetKit

@main
struct RunWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextRunWidget()
    }
}

/// The day before a planned run, that run; otherwise the last run done.
struct NextRunWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NextRun", provider: Provider()) { entry in
            NextRunWidgetView(entry: entry)
        }
        .configurationDisplayName("Próximo treino")
        .description("O treino de amanhã na véspera; nos outros dias, a última corrida.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct Entry: TimelineEntry {
    enum Content {
        case tomorrow(PlannedRun)
        case last(Activity, map: RouteSnapshot?)
        case empty
    }

    let date: Date
    let content: Content
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, content: .tomorrow(.sample))
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await fetch(context).entry) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Task {
            let result = await fetch(context)
            // "Tomorrow" moves at midnight; in between, refresh every hour so a
            // new plan or a freshly synced run shows up. Retry sooner on failure.
            let cal = Calendar.current
            let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: .now)!)
            let soon = Date.now.addingTimeInterval(result.failed ? 15 * 60 : 60 * 60)
            completion(Timeline(entries: [result.entry], policy: .after(min(midnight, soon))))
        }
    }

    private func fetch(_ context: Context) async -> (entry: Entry, failed: Bool) {
        let tomorrow = ISODate.dayString(Calendar.current.date(byAdding: .day, value: 1, to: .now)!)
        async let plans = API.plans(from: tomorrow, to: tomorrow)
        async let recent = API.activities(limit: 1)

        if let run = (try? await plans)?.first(where: { $0.status != "skipped" }) {
            return (Entry(date: .now, content: .tomorrow(run)), false)
        }
        if let last = (try? await recent)?.first {
            return (Entry(date: .now, content: .last(last, map: await map(for: last, context))), false)
        }
        return (Entry(date: .now, content: .empty), true)
    }

    /// The medium widget's right half: an Apple Maps snapshot of the full route.
    private func map(for run: Activity, _ context: Context) async -> RouteSnapshot? {
        guard context.family == .systemMedium else { return nil }
        let polyline = (try? await API.route(source: run.source, externalId: run.externalId)) ?? run.thumb
        guard let polyline else { return nil }
        let coords = decodePolyline(polyline, precision: polyline == run.thumb ? 4 : 5)
        // Content margins (16) around, 14 between the text column and the map.
        let size = CGSize(width: (context.displaySize.width - 32 - 14) / 2, height: context.displaySize.height - 32)
        return await RouteSnapshot.make(coords, size: size)
    }
}

// MARK: - Views

struct NextRunWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        Group {
            switch family {
            case .accessoryInline: inline
            case .accessoryRectangular: rectangular
            case .systemMedium: medium
            default: small
            }
        }
        .widgetURL(url)
        .containerBackground(for: .widget) { WidgetBackground() }
    }

    private var url: URL? {
        switch entry.content {
        case .tomorrow: URL(string: "run://plan")
        case .last(let a, _): URL(string: "run://activity/\(a.source)/\(a.externalId)")
        case .empty: URL(string: "run://")
        }
    }

    // MARK: Home screen

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(content: entry.content)
            Text(title)
                .font(.headline)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            bigNumber
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            small
            switch entry.content {
            case .tomorrow(let run):
                VStack(alignment: .leading, spacing: 4) {
                    if let lines = run.workout?.lines, !lines.isEmpty {
                        ForEach(lines.prefix(4), id: \.self) { line in
                            Text(line).font(.caption).lineLimit(2)
                        }
                    } else if let notes = run.notes {
                        Text(notes).font(.caption).lineLimit(6)
                    }
                    Spacer(minLength: 0)
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            case .last(_, let map?):
                RouteMapImage(map: map)
            case .last(let a, nil):
                let coords = a.thumb.map { decodePolyline($0, precision: 4) } ?? []
                if coords.count > 1 {
                    RouteShape(coords: coords)
                        .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                        .widgetAccentable()
                        .padding(6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            case .empty:
                EmptyView()
            }
        }
    }

    @ViewBuilder private var bigNumber: some View {
        switch entry.content {
        case .tomorrow(let run):
            VStack(alignment: .leading, spacing: 0) {
                if let d = run.plannedDistance {
                    number(Fmt.km(d, digits: 1), unit: "km")
                } else if let s = run.durationSec {
                    number(Fmt.duration(s), unit: "min")
                }
                Text(Labels.runType(run.type))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case .last(let a, _):
            VStack(alignment: .leading, spacing: 0) {
                number(Fmt.km(a.distance), unit: "km")
                Text("\(Fmt.pace(a.paceSecPerKm))/km · \(Fmt.duration(a.movingTime))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        case .empty:
            Text("Sem dados").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func number(_ value: String, unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(value).font(.display(40)).monospacedDigit()
            Text(unit).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var title: String {
        switch entry.content {
        case .tomorrow(let run): run.shortTitle ?? Labels.runType(run.type)
        case .last(let a, _): a.name
        case .empty: "Run"
        }
    }

    // MARK: Lock screen

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow(content: entry.content)
            Text(title).font(.headline).lineLimit(1)
            Text(detail).font(.caption).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        switch entry.content {
        case .tomorrow(let run): Label("Amanhã: \(title)", systemImage: "figure.run")
        case .last(let a, _): Label("\(Fmt.km(a.distance)) km · \(Fmt.pace(a.paceSecPerKm))/km", systemImage: "figure.run")
        case .empty: Label("Run", systemImage: "figure.run")
        }
    }

    private var detail: String {
        switch entry.content {
        case .tomorrow(let run):
            [run.plannedDistance.map { "\(Fmt.km($0, digits: 1)) km" }, Labels.runType(run.type)]
                .compactMap { $0 }.joined(separator: " · ")
        case .last(let a, _):
            "\(Fmt.km(a.distance)) km · \(Fmt.pace(a.paceSecPerKm))/km"
        case .empty:
            ""
        }
    }
}

private struct Eyebrow: View {
    let content: Entry.Content

    var body: some View {
        Group {
            switch content {
            case .tomorrow: Label("AMANHÃ", systemImage: "calendar")
            case .last(let a, _): Label(lastLabel(a.date), systemImage: "checkmark.circle.fill")
            case .empty: Label("RUN", systemImage: "figure.run")
            }
        }
        .font(.caption2.weight(.bold))
        .foregroundStyle(.tint)
        .widgetAccentable()
    }

    private func lastLabel(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "HOJE" }
        if cal.isDateInYesterday(d) { return "ONTEM" }
        return d.formatted(.dateTime.weekday(.abbreviated).day().locale(Fmt.locale)).uppercased()
    }
}

private struct RouteMapImage: View {
    @Environment(\.colorScheme) private var scheme
    let map: RouteSnapshot

    var body: some View {
        Image(uiImage: scheme == .dark ? map.dark : map.light)
            .resizable()
            .widgetAccentedRenderingMode(.fullColor)
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(.rect(cornerRadius: 14))
    }
}

/// Plain system fill with a volt glow in one corner; the system drops it in
/// the clear and tinted home screen styles.
private struct WidgetBackground: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
            RadialGradient(colors: [Color.volt.opacity(0.35), .clear], center: .topTrailing, startRadius: 0, endRadius: 180)
        }
    }
}

extension PlannedRun {
    static let sample = PlannedRun(
        id: "sample", date: ISODate.dayString(.now), type: "tempo", distance: 8000,
        notes: "@T 4:50–4:55/km, RPE 6-7.", shortTitle: "Limiar 2x12'", status: "planned"
    )
}

#Preview(as: .systemMedium) {
    NextRunWidget()
} timeline: {
    Entry(date: .now, content: .tomorrow(.sample))
}
